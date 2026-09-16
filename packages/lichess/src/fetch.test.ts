import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetForTests,
  configureLichessFetch,
  LichessRateLimited,
  lichessFetch,
  lichessQueueLength,
  setLichessTokenProvider,
  type LichessFetchImpl,
} from './fetch';

// The test environment (plain Node, no jsdom) has no global localStorage — same situation
// records.test.ts documents for bot-rating-test — so tests that care about the persisted-
// cooldown behavior install this minimal in-memory Storage first.
class MemoryStorage implements Storage {
  protected store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

let currentTime = 1_000_000;
const nowFn = (): number => currentTime;

function jsonResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

// A real macrotask flush — lets any pending microtask chains (queue hand-offs, promise
// resolutions) settle before the next assertion, without needing fake timers (nothing in
// fetch.ts uses setTimeout; every "wait" here is a caller-controlled gate promise).
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  currentTime = 1_000_000;
  _resetForTests();
  configureLichessFetch({ now: nowFn });
  setLichessTokenProvider(undefined);
});

describe('queueing', () => {
  it('runs requests serially: the second only starts once the first resolves', async () => {
    const calls: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const fetchImpl: LichessFetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/a')) await firstGate;
      return jsonResponse(200);
    });
    configureLichessFetch({ fetchImpl });

    const p1 = lichessFetch('https://lichess.org/a');
    const p2 = lichessFetch('https://lichess.org/b');
    expect(lichessQueueLength()).toBe(2);

    await flush();
    // Only the first request has started; the second is still waiting its turn.
    expect(calls).toEqual(['https://lichess.org/a']);

    releaseFirst();
    await p1;
    await p2;
    expect(calls).toEqual(['https://lichess.org/a', 'https://lichess.org/b']);
    expect(lichessQueueLength()).toBe(0);
  });

  it('dedupes concurrent identical GET requests, cloning the response for the second caller', async () => {
    let callCount = 0;
    const fetchImpl: LichessFetchImpl = vi.fn(async () => {
      callCount++;
      return jsonResponse(200, { hello: 'world' });
    });
    configureLichessFetch({ fetchImpl });

    const [r1, r2] = await Promise.all([
      lichessFetch('https://lichess.org/dup'),
      lichessFetch('https://lichess.org/dup'),
    ]);
    expect(callCount).toBe(1);
    expect(await r1.json()).toEqual({ hello: 'world' });
    expect(await r2.json()).toEqual({ hello: 'world' });
  });

  it('rejects an aborted queued request without blocking the rest of the queue', async () => {
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    const fetchImpl: LichessFetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/first')) await firstGate;
      return jsonResponse(200);
    });
    configureLichessFetch({ fetchImpl });

    const p1 = lichessFetch('https://lichess.org/first');
    const controller = new AbortController();
    const p2 = lichessFetch('https://lichess.org/second', { signal: controller.signal });
    const p3 = lichessFetch('https://lichess.org/third');

    await flush();
    controller.abort();
    await expect(p2).rejects.toMatchObject({ name: 'AbortError' });

    releaseFirst();
    await p1;
    await p3;

    // The aborted request never actually fetched; only "first" and "third" hit fetchImpl.
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0])).toEqual([
      'https://lichess.org/first',
      'https://lichess.org/third',
    ]);
  });
});

describe('429 cooldown', () => {
  it('rejects immediately without a fetch call while in cooldown, then flows again after it elapses', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': '30' }));
    configureLichessFetch({ fetchImpl });

    await expect(lichessFetch('https://lichess.org/x')).rejects.toBeInstanceOf(LichessRateLimited);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    (fetchImpl as ReturnType<typeof vi.fn>).mockClear();
    await expect(lichessFetch('https://lichess.org/x')).rejects.toBeInstanceOf(LichessRateLimited);
    expect(fetchImpl).not.toHaveBeenCalled();

    currentTime += 30_001;
    (fetchImpl as ReturnType<typeof vi.fn>).mockImplementation(async () => jsonResponse(200));
    const res = await lichessFetch('https://lichess.org/x');
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('honors a numeric Retry-After (seconds)', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': '5' }));
    configureLichessFetch({ fetchImpl });
    const before = currentTime;
    await expect(lichessFetch('https://lichess.org/y')).rejects.toMatchObject({ retryAt: before + 5000 });
  });

  it('honors an HTTP-date Retry-After', async () => {
    const retryDate = new Date(currentTime + 45_000);
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': retryDate.toUTCString() }));
    configureLichessFetch({ fetchImpl });
    await expect(lichessFetch('https://lichess.org/z')).rejects.toMatchObject({ retryAt: retryDate.getTime() });
  });

  it('defaults to a 60 s cooldown when Retry-After is missing', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(429));
    configureLichessFetch({ fetchImpl });
    const before = currentTime;
    await expect(lichessFetch('https://lichess.org/no-header')).rejects.toMatchObject({ retryAt: before + 60_000 });
  });

  it('honors a retryAt persisted in localStorage by a fresh module load', async () => {
    const future = currentTime + 20_000;
    globalThis.localStorage.setItem('human-chess.lichess.retryAt.v1', String(future));
    vi.resetModules();
    const fresh = await import('./fetch');
    const freshFetchImpl = vi.fn(async () => jsonResponse(200));
    fresh.configureLichessFetch({ fetchImpl: freshFetchImpl, now: nowFn });

    await expect(fresh.lichessFetch('https://lichess.org/w')).rejects.toBeInstanceOf(fresh.LichessRateLimited);
    expect(freshFetchImpl).not.toHaveBeenCalled();
  });
});

describe('token provider', () => {
  it('adds an Authorization header only for lichess.org / explorer.lichess.ovh, keeping caller headers', async () => {
    const seen: Array<{ url: string; auth: string | null; custom: string | null }> = [];
    const fetchImpl: LichessFetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({ url, auth: headers.get('Authorization'), custom: headers.get('X-Custom') });
      return jsonResponse(200);
    });
    configureLichessFetch({ fetchImpl });
    setLichessTokenProvider(() => 'secret-token');

    await lichessFetch('https://lichess.org/api/thing', { headers: { 'X-Custom': '1' } });
    await lichessFetch('https://explorer.lichess.ovh/lichess');
    await lichessFetch('https://example.com/unrelated');

    expect(seen[0]).toEqual({ url: 'https://lichess.org/api/thing', auth: 'Bearer secret-token', custom: '1' });
    expect(seen[1]?.auth).toBe('Bearer secret-token');
    expect(seen[2]?.auth).toBeNull();
  });

  it('keeps a caller-provided Authorization header instead of overriding it', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer caller-token');
      return jsonResponse(200);
    });
    configureLichessFetch({ fetchImpl });
    setLichessTokenProvider(() => 'provider-token');
    await lichessFetch('https://lichess.org/x', { headers: { Authorization: 'Bearer caller-token' } });
  });

  it('adds no header when the provider returns undefined', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      return jsonResponse(200);
    });
    configureLichessFetch({ fetchImpl });
    setLichessTokenProvider(() => undefined);
    await lichessFetch('https://lichess.org/x');
  });
});

describe('reviewer fixes (2026-09-16)', () => {
  it('caps a corrupt persisted retryAt at ten minutes instead of locking the app out', async () => {
    globalThis.localStorage.setItem('human-chess.lichess.retryAt.v1', '9000000000000000');
    vi.resetModules();
    const fresh = await import('./fetch');
    const freshFetchImpl = vi.fn(async () => jsonResponse(200));
    // The module read the value with the real clock, so the cap is relative to real time.
    fresh.configureLichessFetch({ fetchImpl: freshFetchImpl, now: () => Date.now() + 11 * 60_000 });
    await expect(fresh.lichessFetch('https://lichess.org/w')).resolves.toBeInstanceOf(Response);
    expect(freshFetchImpl).toHaveBeenCalledTimes(1);
  });

  it('caps an absurd Retry-After at ten minutes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'Retry-After': '86400' }));
    configureLichessFetch({ fetchImpl });
    await expect(lichessFetch('https://lichess.org/a')).rejects.toMatchObject({ retryAt: currentTime + 10 * 60_000 });
  });

  it('never sends the bearer token over plain http', async () => {
    const seen: Array<string | null> = [];
    const fetchImpl: LichessFetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('Authorization'));
      return jsonResponse(200);
    });
    configureLichessFetch({ fetchImpl });
    setLichessTokenProvider(() => 'secret-token');
    await lichessFetch('http://lichess.org/plain');
    await lichessFetch('https://lichess.org/secure');
    expect(seen).toEqual([null, 'Bearer secret-token']);
  });

  it('a joiner aborting does not abort the shared request, and a joiner honours its own signal', async () => {
    let release: (() => void) | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeUndefined();
      await new Promise<void>(resolve => {
        release = resolve;
      });
      return jsonResponse(200, { ok: true });
    });
    configureLichessFetch({ fetchImpl });
    const leaderAbort = new AbortController();
    const joinerAbort = new AbortController();
    const leader = lichessFetch('https://lichess.org/shared', { signal: leaderAbort.signal });
    const joiner = lichessFetch('https://lichess.org/shared', { signal: joinerAbort.signal });
    const third = lichessFetch('https://lichess.org/shared');
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
    // Hold the queue with a POST so the GET leader never reaches the network before it's aborted.
    let releaseBlocker: (() => void) | undefined;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/blocker')) {
        await new Promise<void>(resolve => {
          releaseBlocker = resolve;
        });
      }
      return jsonResponse(200, { url });
    });
    configureLichessFetch({ fetchImpl });
    const blocker = lichessFetch('https://lichess.org/blocker', { method: 'POST' });
    const leaderAbort = new AbortController();
    const leader = lichessFetch('https://lichess.org/shared', { signal: leaderAbort.signal });
    const joiner = lichessFetch('https://lichess.org/shared');
    await flush();
    leaderAbort.abort();
    await expect(leader).rejects.toMatchObject({ name: 'AbortError' });
    releaseBlocker?.();
    await blocker;
    const response = await joiner;
    expect(await response.json()).toEqual({ url: 'https://lichess.org/shared' });
    // The blocker, and exactly one request for the shared URL (the joiner's own retry).
    expect(fetchImpl.mock.calls.map(c => c[0])).toEqual(['https://lichess.org/blocker', 'https://lichess.org/shared']);
  });

  it('dedupes on URL plus Accept header, so a PGN and a JSON request for one URL are separate', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200));
    configureLichessFetch({ fetchImpl });
    await Promise.all([
      lichessFetch('https://lichess.org/same', { headers: { Accept: 'application/x-chess-pgn' } }),
      lichessFetch('https://lichess.org/same', { headers: { Accept: 'application/json' } }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
