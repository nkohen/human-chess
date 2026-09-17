import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSiteClient, type SiteClient, type SiteFetchImpl } from './client';
import { MemoryStorage, jsonResponse } from './testing';

// The test environment (plain Node, no jsdom) has no global localStorage — tests that care
// about the persisted-cooldown or cache behavior install this minimal in-memory Storage first
// (same pattern as packages/lichess/src/fetch.test.ts and cache.test.ts, which this file's
// cases were generalized from on 2026-09-17).
class QuotaLimitedStorage extends MemoryStorage {
  constructor(private readonly limitBytes: number) {
    super();
  }
  override setItem(key: string, value: string): void {
    let total = key.length + value.length;
    for (const [k, v] of this.store) {
      if (k !== key) total += k.length + v.length;
    }
    if (total > this.limitBytes) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    super.setItem(key, value);
  }
}

let currentTime = 1_000_000;
const nowFn = (): number => currentTime;

function textResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function freshClient(authHosts: string[] = ['example.test']): SiteClient {
  const client = createSiteClient({
    name: 'example',
    errorClassName: 'ExampleRateLimited',
    storagePrefix: 'human-chess.example',
    authHosts,
  });
  client.configureFetch({ now: nowFn });
  return client;
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  currentTime = 1_000_000;
});

describe('queueing', () => {
  it('runs requests serially: the second only starts once the first resolves', async () => {
    const client = freshClient();
    const calls: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const fetchImpl: SiteFetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/a')) await firstGate;
      return jsonResponse(200);
    });
    client.configureFetch({ fetchImpl });

    const p1 = client.fetch('https://example.test/a');
    const p2 = client.fetch('https://example.test/b');
    expect(client.queueLength()).toBe(2);

    await flush();
    expect(calls).toEqual(['https://example.test/a']);

    releaseFirst();
    await p1;
    await p2;
    expect(calls).toEqual(['https://example.test/a', 'https://example.test/b']);
    expect(client.queueLength()).toBe(0);
  });

  it('dedupes concurrent identical GET requests, cloning the response for the second caller', async () => {
    const client = freshClient();
    let callCount = 0;
    const fetchImpl: SiteFetchImpl = vi.fn(async () => {
      callCount++;
      return jsonResponse(200, { hello: 'world' });
    });
    client.configureFetch({ fetchImpl });

    const [r1, r2] = await Promise.all([client.fetch('https://example.test/dup'), client.fetch('https://example.test/dup')]);
    expect(callCount).toBe(1);
    expect(await r1.json()).toEqual({ hello: 'world' });
    expect(await r2.json()).toEqual({ hello: 'world' });
  });

  it('dedupes on URL plus Accept header, so two different-shaped requests for one URL are separate', async () => {
    const client = freshClient();
    const fetchImpl = vi.fn(async () => jsonResponse(200));
    client.configureFetch({ fetchImpl });
    await Promise.all([
      client.fetch('https://example.test/same', { headers: { Accept: 'text/plain' } }),
      client.fetch('https://example.test/same', { headers: { Accept: 'application/json' } }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects an aborted queued request without blocking the rest of the queue', async () => {
    const client = freshClient();
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const fetchImpl: SiteFetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/first')) await firstGate;
      return jsonResponse(200);
    });
    client.configureFetch({ fetchImpl });

    const p1 = client.fetch('https://example.test/first');
    const controller = new AbortController();
    const p2 = client.fetch('https://example.test/second', { signal: controller.signal });
    const p3 = client.fetch('https://example.test/third');

    await flush();
    controller.abort();
    await expect(p2).rejects.toMatchObject({ name: 'AbortError' });

    releaseFirst();
    await p1;
    await p3;

    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0])).toEqual([
      'https://example.test/first',
      'https://example.test/third',
    ]);
  });

  it('a joiner aborting does not abort the shared request, and a joiner honours its own signal', async () => {
    const client = freshClient();
    let release: (() => void) | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeUndefined();
      await new Promise<void>(resolve => {
        release = resolve;
      });
      return jsonResponse(200, { ok: true });
    });
    client.configureFetch({ fetchImpl });
    const leaderAbort = new AbortController();
    const joinerAbort = new AbortController();
    const leader = client.fetch('https://example.test/shared', { signal: leaderAbort.signal });
    const joiner = client.fetch('https://example.test/shared', { signal: joinerAbort.signal });
    const third = client.fetch('https://example.test/shared');
    await flush();
    joinerAbort.abort();
    await expect(joiner).rejects.toMatchObject({ name: 'AbortError' });
    release?.();
    const [a, b] = await Promise.all([leader, third]);
    expect(await a.json()).toEqual({ ok: true });
    expect(await b.json()).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('a joiner survives its leader being aborted before the request was sent, by sending its own', async () => {
    const client = freshClient();
    let releaseBlocker: (() => void) | undefined;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/blocker')) {
        await new Promise<void>(resolve => {
          releaseBlocker = resolve;
        });
      }
      return jsonResponse(200, { url });
    });
    client.configureFetch({ fetchImpl });
    const blocker = client.fetch('https://example.test/blocker', { method: 'POST' });
    const leaderAbort = new AbortController();
    const leader = client.fetch('https://example.test/shared', { signal: leaderAbort.signal });
    const joiner = client.fetch('https://example.test/shared');
    await flush();
    leaderAbort.abort();
    await expect(leader).rejects.toMatchObject({ name: 'AbortError' });
    releaseBlocker?.();
    await blocker;
    const response = await joiner;
    expect(await response.json()).toEqual({ url: 'https://example.test/shared' });
    expect(fetchImpl.mock.calls.map(c => c[0])).toEqual(['https://example.test/blocker', 'https://example.test/shared']);
  });
});

describe('abort reasons', () => {
  it('propagates an AbortSignal.timeout() TimeoutError reason instead of a generic AbortError', async () => {
    const client = freshClient();
    // Never resolves — simulates a hung request so the timeout is what settles the promise.
    const fetchImpl: SiteFetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    client.configureFetch({ fetchImpl });

    const result = client.fetch('https://example.test/hangs', { signal: AbortSignal.timeout(5) });
    await expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await expect(result).rejects.not.toMatchObject({ name: 'AbortError' });
  });

  it('propagates a caller-supplied AbortController reason unchanged', async () => {
    const client = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    client.configureFetch({ fetchImpl });
    const controller = new AbortController();
    const customReason = new Error('custom abort reason');

    const p1 = client.fetch('https://example.test/x', { signal: controller.signal });
    await flush();
    controller.abort(customReason);
    await expect(p1).rejects.toBe(customReason);
  });
});

describe('429 cooldown', () => {
  it('rejects immediately without a fetch call while in cooldown, then flows again after it elapses', async () => {
    const client = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': '30' }));
    client.configureFetch({ fetchImpl });

    await expect(client.fetch('https://example.test/x')).rejects.toBeInstanceOf(client.RateLimited);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    (fetchImpl as ReturnType<typeof vi.fn>).mockClear();
    await expect(client.fetch('https://example.test/x')).rejects.toBeInstanceOf(client.RateLimited);
    expect(fetchImpl).not.toHaveBeenCalled();

    currentTime += 30_001;
    (fetchImpl as ReturnType<typeof vi.fn>).mockImplementation(async () => jsonResponse(200));
    const res = await client.fetch('https://example.test/x');
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses the configured site name in the error message', async () => {
    const client = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(async () => jsonResponse(429));
    client.configureFetch({ fetchImpl });
    await expect(client.fetch('https://example.test/x')).rejects.toMatchObject({
      name: 'ExampleRateLimited',
      message: expect.stringContaining('example asked us to wait'),
    });
  });

  it('honors a numeric Retry-After (seconds)', async () => {
    const client = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': '5' }));
    client.configureFetch({ fetchImpl });
    const before = currentTime;
    await expect(client.fetch('https://example.test/y')).rejects.toMatchObject({ retryAt: before + 5000 });
  });

  it('honors an HTTP-date Retry-After', async () => {
    const client = freshClient();
    const retryDate = new Date(currentTime + 45_000);
    const fetchImpl: SiteFetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': retryDate.toUTCString() }));
    client.configureFetch({ fetchImpl });
    await expect(client.fetch('https://example.test/z')).rejects.toMatchObject({ retryAt: retryDate.getTime() });
  });

  it('defaults to a 60 s cooldown when Retry-After is missing', async () => {
    const client = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(async () => jsonResponse(429));
    client.configureFetch({ fetchImpl });
    const before = currentTime;
    await expect(client.fetch('https://example.test/no-header')).rejects.toMatchObject({ retryAt: before + 60_000 });
  });

  it('caps an absurd Retry-After at ten minutes', async () => {
    const client = freshClient();
    const fetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': '86400' }));
    client.configureFetch({ fetchImpl });
    await expect(client.fetch('https://example.test/a')).rejects.toMatchObject({ retryAt: currentTime + 10 * 60_000 });
  });

  it('a fresh client with the same storage prefix inherits a persisted cooldown', async () => {
    const first = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': '20' }));
    first.configureFetch({ fetchImpl });
    await expect(first.fetch('https://example.test/w')).rejects.toBeInstanceOf(first.RateLimited);

    // A second client instance sharing the same storagePrefix (as would happen across a page
    // reload) picks up the cooldown that was persisted to localStorage.
    const second = freshClient();
    const freshFetchImpl = vi.fn(async () => jsonResponse(200));
    second.configureFetch({ fetchImpl: freshFetchImpl, now: nowFn });
    await expect(second.fetch('https://example.test/w')).rejects.toBeInstanceOf(second.RateLimited);
    expect(freshFetchImpl).not.toHaveBeenCalled();
  });

  it('caps a corrupt persisted retryAt at ten minutes instead of locking the app out', async () => {
    globalThis.localStorage.setItem('human-chess.example.retryAt.v1', '9000000000000000');
    // The client reads persisted state with the real clock at construction time.
    const client = createSiteClient({
      name: 'example',
      errorClassName: 'ExampleRateLimited',
      storagePrefix: 'human-chess.example',
    });
    const freshFetchImpl = vi.fn(async () => jsonResponse(200));
    client.configureFetch({ fetchImpl: freshFetchImpl, now: () => Date.now() + 11 * 60_000 });
    await expect(client.fetch('https://example.test/w')).resolves.toBeInstanceOf(Response);
    expect(freshFetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('token provider (auth header)', () => {
  it('adds an Authorization header only for configured hosts, keeping caller headers', async () => {
    const client = freshClient(['example.test', 'other.example.test']);
    const seen: Array<{ url: string; auth: string | null; custom: string | null }> = [];
    const fetchImpl: SiteFetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({ url, auth: headers.get('Authorization'), custom: headers.get('X-Custom') });
      return jsonResponse(200);
    });
    client.configureFetch({ fetchImpl });
    client.setTokenProvider(() => 'secret-token');

    await client.fetch('https://example.test/api/thing', { headers: { 'X-Custom': '1' } });
    await client.fetch('https://other.example.test/thing');
    await client.fetch('https://unrelated.test/thing');

    expect(seen[0]).toEqual({ url: 'https://example.test/api/thing', auth: 'Bearer secret-token', custom: '1' });
    expect(seen[1]?.auth).toBe('Bearer secret-token');
    expect(seen[2]?.auth).toBeNull();
  });

  it('keeps a caller-provided Authorization header instead of overriding it', async () => {
    const client = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer caller-token');
      return jsonResponse(200);
    });
    client.configureFetch({ fetchImpl });
    client.setTokenProvider(() => 'provider-token');
    await client.fetch('https://example.test/x', { headers: { Authorization: 'Bearer caller-token' } });
  });

  it('never sends the bearer token over plain http', async () => {
    const client = freshClient();
    const seen: Array<string | null> = [];
    const fetchImpl: SiteFetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('Authorization'));
      return jsonResponse(200);
    });
    client.configureFetch({ fetchImpl });
    client.setTokenProvider(() => 'secret-token');
    await client.fetch('http://example.test/plain');
    await client.fetch('https://example.test/secure');
    expect(seen).toEqual([null, 'Bearer secret-token']);
  });

  it('never sets a header when no authHosts are configured', async () => {
    const client = freshClient([]);
    const fetchImpl: SiteFetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      return jsonResponse(200);
    });
    client.configureFetch({ fetchImpl });
    client.setTokenProvider(() => 'secret-token');
    await client.fetch('https://example.test/x');
  });
});

describe('cachedText / cachedJson', () => {
  it('fetches on a miss, then serves the cache hit with no network call and no queue interaction', async () => {
    const client = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(async () => textResponse(200, 'hello'));

    const first = await client.cachedText('https://example.test/thing', 60_000, undefined, fetchImpl);
    expect(first).toBe('hello');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const second = await client.cachedText('https://example.test/thing', 60_000, undefined, fetchImpl);
    expect(second).toBe('hello');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(client.queueLength()).toBe(0);
  });

  it('expires a cached entry once its TTL has passed', async () => {
    const client = freshClient();
    const fetchImplV1: SiteFetchImpl = vi.fn(async () => textResponse(200, 'v1'));
    await client.cachedText('https://example.test/thing', 1000, undefined, fetchImplV1);

    currentTime += 1001;
    const fetchImplV2: SiteFetchImpl = vi.fn(async () => textResponse(200, 'v2'));
    const result = await client.cachedText('https://example.test/thing', 1000, undefined, fetchImplV2);
    expect(result).toBe('v2');
    expect(fetchImplV2).toHaveBeenCalledTimes(1);
  });

  it('does not cache a non-2xx response', async () => {
    const client = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(async () => textResponse(404, 'nope'));
    await expect(client.cachedText('https://example.test/missing', 60_000, undefined, fetchImpl)).resolves.toBe('nope');
    await expect(client.cachedText('https://example.test/missing', 60_000, undefined, fetchImpl)).resolves.toBe('nope');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('works (without caching, and without throwing) when localStorage is unavailable', async () => {
    const client = freshClient();
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.localStorage;
    const fetchImpl: SiteFetchImpl = vi.fn(async () => textResponse(200, 'y'));
    expect(await client.cachedText('https://example.test/thing', 60_000, undefined, fetchImpl)).toBe('y');
    expect(await client.cachedText('https://example.test/thing', 60_000, undefined, fetchImpl)).toBe('y');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('tolerates storage holding corrupt JSON for a cache key (treats as a miss)', async () => {
    const client = freshClient();
    globalThis.localStorage.setItem('human-chess.example.cache.v1:https://example.test/thing', 'not json{{{');
    const fetchImpl: SiteFetchImpl = vi.fn(async () => textResponse(200, 'fresh'));
    expect(await client.cachedText('https://example.test/thing', 60_000, undefined, fetchImpl)).toBe('fresh');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('evicts the oldest entries once the write itself fails (e.g. a real quota error)', async () => {
    globalThis.localStorage = new QuotaLimitedStorage(500);
    const client = freshClient();

    const fetchImplOld: SiteFetchImpl = vi.fn(async () => textResponse(200, 'x'.repeat(100)));
    await client.cachedText('https://example.test/old', 60_000, undefined, fetchImplOld);

    const fetchImplNew: SiteFetchImpl = vi.fn(async () => textResponse(200, 'y'.repeat(400)));
    const result = await client.cachedText('https://example.test/new', 60_000, undefined, fetchImplNew);
    expect(result).toBe('y'.repeat(400));

    expect(globalThis.localStorage.getItem('human-chess.example.cache.v1:https://example.test/old')).toBeNull();

    const fetchImplNewAgain: SiteFetchImpl = vi.fn(async () => textResponse(200, 'should not be called'));
    const newAgain = await client.cachedText('https://example.test/new', 60_000, undefined, fetchImplNewAgain);
    expect(newAgain).toBe('y'.repeat(400));
    expect(fetchImplNewAgain).not.toHaveBeenCalled();
  });

  it('evicts the oldest entries once the ~2 MB total cache cap is exceeded', async () => {
    const client = freshClient();
    const big = (ch: string): string => ch.repeat(760_000);

    await client.cachedText('https://example.test/one', 1_000_000, undefined, vi.fn(async () => textResponse(200, big('a'))));
    currentTime += 1000;
    await client.cachedText('https://example.test/two', 1_000_000, undefined, vi.fn(async () => textResponse(200, big('b'))));
    currentTime += 1000;
    await client.cachedText('https://example.test/three', 1_000_000, undefined, vi.fn(async () => textResponse(200, big('c'))));

    const fetchImplOneAgain: SiteFetchImpl = vi.fn(async () => textResponse(200, 'fresh-one'));
    expect(await client.cachedText('https://example.test/one', 1_000_000, undefined, fetchImplOneAgain)).toBe('fresh-one');
    expect(fetchImplOneAgain).toHaveBeenCalledTimes(1);

    const fetchImplThreeAgain: SiteFetchImpl = vi.fn(async () => textResponse(200, 'should not be called'));
    expect(await client.cachedText('https://example.test/three', 1_000_000, undefined, fetchImplThreeAgain)).toBe(big('c'));
    expect(fetchImplThreeAgain).not.toHaveBeenCalled();
  });

  it('cachedJson parses the cached body as JSON on both a miss and a hit', async () => {
    const client = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(async () => textResponse(200, JSON.stringify({ a: 1 })));
    const first = await client.cachedJson<{ a: number }>('https://example.test/json', 60_000, undefined, fetchImpl);
    expect(first).toEqual({ a: 1 });
    const second = await client.cachedJson<{ a: number }>('https://example.test/json', 60_000, undefined, fetchImpl);
    expect(second).toEqual({ a: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('clearCache', () => {
  it('removes cached entries so the next call fetches again', async () => {
    const client = freshClient();
    const fetchImpl: SiteFetchImpl = vi.fn(async () => textResponse(200, 'x'));
    await client.cachedText('https://example.test/thing', 60_000, undefined, fetchImpl);
    client.clearCache();
    await client.cachedText('https://example.test/thing', 60_000, undefined, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('independence between clients', () => {
  it('two clients with different storage prefixes have independent cooldowns', async () => {
    const a = createSiteClient({ name: 'site-a', errorClassName: 'SiteARateLimited', storagePrefix: 'human-chess.site-a' });
    const b = createSiteClient({ name: 'site-b', errorClassName: 'SiteBRateLimited', storagePrefix: 'human-chess.site-b' });
    a.configureFetch({ now: nowFn, fetchImpl: vi.fn(async () => jsonResponse(429)) });
    b.configureFetch({ now: nowFn, fetchImpl: vi.fn(async () => jsonResponse(200)) });

    await expect(a.fetch('https://example.test/x')).rejects.toBeInstanceOf(a.RateLimited);
    const res = await b.fetch('https://example.test/x');
    expect(res.status).toBe(200);
  });
});
