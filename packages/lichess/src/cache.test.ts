import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetForTests, configureLichessFetch, lichessQueueLength, type LichessFetchImpl } from './fetch';
import { cachedLichessJson, cachedLichessText, clearLichessCache } from './cache';

// Same in-memory Storage pattern as fetch.test.ts / subprojects/bot-rating-test/src/records.test.ts.
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

// Simulates a real storage quota well under our own ~2 MB soft cap, so a write can fail on its
// own even when our proactive cap-based eviction found nothing worth evicting.
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

function textResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  currentTime = 1_000_000;
  _resetForTests();
  configureLichessFetch({ now: () => currentTime });
});

describe('cachedLichessText', () => {
  it('fetches on a miss, then serves the cache hit with no network call and no queue interaction', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async () => textResponse(200, 'hello'));

    const first = await cachedLichessText('https://lichess.org/thing', 60_000, undefined, fetchImpl);
    expect(first).toBe('hello');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const second = await cachedLichessText('https://lichess.org/thing', 60_000, undefined, fetchImpl);
    expect(second).toBe('hello');
    expect(fetchImpl).toHaveBeenCalledTimes(1); // still 1 — served from cache
    expect(lichessQueueLength()).toBe(0); // cachedLichessText never went near lichessFetch's queue
  });

  it('expires a cached entry once its TTL has passed', async () => {
    const fetchImplV1: LichessFetchImpl = vi.fn(async () => textResponse(200, 'v1'));
    await cachedLichessText('https://lichess.org/thing', 1000, undefined, fetchImplV1);

    currentTime += 1001;
    const fetchImplV2: LichessFetchImpl = vi.fn(async () => textResponse(200, 'v2'));
    const result = await cachedLichessText('https://lichess.org/thing', 1000, undefined, fetchImplV2);
    expect(result).toBe('v2');
    expect(fetchImplV2).toHaveBeenCalledTimes(1);
  });

  it('does not cache a non-2xx response', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async () => textResponse(404, 'nope'));
    await expect(cachedLichessText('https://lichess.org/missing', 60_000, undefined, fetchImpl)).resolves.toBe('nope');
    await expect(cachedLichessText('https://lichess.org/missing', 60_000, undefined, fetchImpl)).resolves.toBe('nope');
    expect(fetchImpl).toHaveBeenCalledTimes(2); // never cached, so every call hits the network
  });

  it('works (without caching, and without throwing) when localStorage is unavailable', async () => {
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.localStorage;
    const fetchImpl: LichessFetchImpl = vi.fn(async () => textResponse(200, 'y'));
    expect(await cachedLichessText('https://lichess.org/thing', 60_000, undefined, fetchImpl)).toBe('y');
    expect(await cachedLichessText('https://lichess.org/thing', 60_000, undefined, fetchImpl)).toBe('y');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('tolerates storage holding corrupt JSON for a cache key (treats as a miss)', async () => {
    globalThis.localStorage.setItem('human-chess.lichess.cache.v1:https://lichess.org/thing', 'not json{{{');
    const fetchImpl: LichessFetchImpl = vi.fn(async () => textResponse(200, 'fresh'));
    expect(await cachedLichessText('https://lichess.org/thing', 60_000, undefined, fetchImpl)).toBe('fresh');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('evicts the oldest entries once the write itself fails (e.g. a real quota error)', async () => {
    globalThis.localStorage = new QuotaLimitedStorage(500);

    const fetchImplOld: LichessFetchImpl = vi.fn(async () => textResponse(200, 'x'.repeat(100)));
    await cachedLichessText('https://lichess.org/old', 60_000, undefined, fetchImplOld);

    // "old" alone fits the tiny quota; "old" + "new" together does not, so this write fails on
    // the first attempt and must evict "old" to succeed on the retry.
    const fetchImplNew: LichessFetchImpl = vi.fn(async () => textResponse(200, 'y'.repeat(400)));
    const result = await cachedLichessText('https://lichess.org/new', 60_000, undefined, fetchImplNew);
    expect(result).toBe('y'.repeat(400));

    // "old" was evicted to make room for "new" (checked directly — re-fetching "old" through
    // cachedLichessText would itself write a new entry and, under this same tiny quota, evict
    // "new" right back out, which would just be re-demonstrating this eviction rather than
    // confirming "new" survived).
    expect(globalThis.localStorage.getItem('human-chess.lichess.cache.v1:https://lichess.org/old')).toBeNull();

    // "new" is still cached and doesn't need a further fetch.
    const fetchImplNewAgain: LichessFetchImpl = vi.fn(async () => textResponse(200, 'should not be called'));
    const newAgain = await cachedLichessText('https://lichess.org/new', 60_000, undefined, fetchImplNewAgain);
    expect(newAgain).toBe('y'.repeat(400));
    expect(fetchImplNewAgain).not.toHaveBeenCalled();
  });

  it('evicts the oldest entries once the ~2 MB total cache cap is exceeded', async () => {
    const big = (ch: string): string => ch.repeat(760_000);

    await cachedLichessText('https://lichess.org/one', 1_000_000, undefined, vi.fn(async () => textResponse(200, big('a'))));
    currentTime += 1000;
    await cachedLichessText('https://lichess.org/two', 1_000_000, undefined, vi.fn(async () => textResponse(200, big('b'))));
    currentTime += 1000;
    // Three ~760 KB entries exceed the ~2 MB cap; writing this one must evict the oldest ("one").
    await cachedLichessText('https://lichess.org/three', 1_000_000, undefined, vi.fn(async () => textResponse(200, big('c'))));

    const fetchImplOneAgain: LichessFetchImpl = vi.fn(async () => textResponse(200, 'fresh-one'));
    expect(await cachedLichessText('https://lichess.org/one', 1_000_000, undefined, fetchImplOneAgain)).toBe('fresh-one');
    expect(fetchImplOneAgain).toHaveBeenCalledTimes(1); // evicted — had to refetch

    const fetchImplThreeAgain: LichessFetchImpl = vi.fn(async () => textResponse(200, 'should not be called'));
    expect(await cachedLichessText('https://lichess.org/three', 1_000_000, undefined, fetchImplThreeAgain)).toBe(big('c'));
    expect(fetchImplThreeAgain).not.toHaveBeenCalled(); // most recently written — survives
  });
});

describe('cachedLichessJson', () => {
  it('parses the cached body as JSON on both a miss and a hit', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async () => textResponse(200, JSON.stringify({ a: 1 })));
    const first = await cachedLichessJson<{ a: number }>('https://lichess.org/json', 60_000, undefined, fetchImpl);
    expect(first).toEqual({ a: 1 });
    const second = await cachedLichessJson<{ a: number }>('https://lichess.org/json', 60_000, undefined, fetchImpl);
    expect(second).toEqual({ a: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('clearLichessCache', () => {
  it('removes cached entries so the next call fetches again', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async () => textResponse(200, 'x'));
    await cachedLichessText('https://lichess.org/thing', 60_000, undefined, fetchImpl);
    clearLichessCache();
    await cachedLichessText('https://lichess.org/thing', 60_000, undefined, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
