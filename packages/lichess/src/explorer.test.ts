import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetForTests, configureLichessFetch, type LichessFetchImpl } from './fetch';
import { EXPLORER_RATING_BUCKETS, explorerMoves, LichessLoginRequired, ratingBucketsBetween } from './explorer';
import { currentLichessSession } from './auth';

// Same in-memory Storage stand-in used across this package's tests (no jsdom in this workspace).
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function storeSession(): void {
  globalThis.localStorage.setItem(
    'human-chess.lichess.session.v1',
    JSON.stringify({ accessToken: 'tok', expiresAt: currentTime + 100_000, username: 'tester' }),
  );
}

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  currentTime = 1_000_000;
  _resetForTests();
  configureLichessFetch({ now: () => currentTime });
});

describe('ratingBucketsBetween', () => {
  it('returns the documented buckets within the range, inclusive', () => {
    expect(ratingBucketsBetween(1600, 2000)).toEqual([1600, 1800, 2000]);
  });

  it('returns every bucket for a very wide range', () => {
    expect(ratingBucketsBetween(0, 2500)).toEqual([...EXPLORER_RATING_BUCKETS]);
  });

  it('returns an empty list when nothing falls in range', () => {
    expect(ratingBucketsBetween(2600, 2700)).toEqual([]);
  });
});

describe('explorerMoves', () => {
  it('throws LichessLoginRequired when there is no session, without making a request', async () => {
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(200, { white: 0, draws: 0, black: 0, moves: [] }));
    configureLichessFetch({ fetchImpl });

    await expect(explorerMoves(FEN, { ratings: [1600, 1800], speeds: ['blitz'] })).rejects.toBeInstanceOf(LichessLoginRequired);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('queries the explorer with the given fen/ratings/speeds and computes shares and provenance', async () => {
    storeSession();
    let seenUrl: string | undefined;
    const fetchImpl: LichessFetchImpl = vi.fn(async url => {
      seenUrl = url;
      return jsonResponse(200, {
        white: 600,
        draws: 300,
        black: 100,
        moves: [
          { uci: 'e7e5', san: 'e5', white: 500, draws: 250, black: 50 },
          { uci: 'c7c5', san: 'c5', white: 100, draws: 50, black: 50 },
        ],
      });
    });
    configureLichessFetch({ fetchImpl });

    const result = await explorerMoves(FEN, { ratings: [1600, 1800, 2000], speeds: ['blitz', 'rapid', 'classical'] });

    const url = new URL(seenUrl as string);
    expect(url.origin + url.pathname).toBe('https://explorer.lichess.ovh/lichess');
    expect(url.searchParams.get('fen')).toBe(FEN);
    expect(url.searchParams.get('ratings')).toBe('1600,1800,2000');
    expect(url.searchParams.get('speeds')).toBe('blitz,rapid,classical');

    expect(result.fen).toBe(FEN);
    expect(result.total).toBe(1000);
    expect(result.moves).toEqual([
      { uci: 'e7e5', san: 'e5', total: 800, white: 500, draws: 250, black: 50, share: 0.8 },
      { uci: 'c7c5', san: 'c5', total: 200, white: 100, draws: 50, black: 50, share: 0.2 },
    ]);
    expect(result.provenance).toBe('lichess opening explorer, blitz+rapid+classical, ratings 1600–2000, 1,000 games');
  });

  it('caches the response: a second call within the TTL makes no second request', async () => {
    storeSession();
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(200, { white: 1, draws: 0, black: 0, moves: [] }));
    configureLichessFetch({ fetchImpl });

    const opts = { ratings: [1600], speeds: ['blitz'] };
    await explorerMoves(FEN, opts);
    await explorerMoves(FEN, opts);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects with an AbortError when the given signal is already aborted', async () => {
    storeSession();
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(200, { white: 0, draws: 0, black: 0, moves: [] }));
    configureLichessFetch({ fetchImpl });

    const controller = new AbortController();
    controller.abort();
    await expect(explorerMoves(FEN, { ratings: [1600], speeds: ['blitz'], signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a 401 (token no longer accepted) drops the session and asks for a login, rather than parsing the body', async () => {
    storeSession();
    const fetchImpl: LichessFetchImpl = vi.fn(async () => new Response('<html>unauthorized</html>', { status: 401 }));
    configureLichessFetch({ fetchImpl });
    await expect(explorerMoves(FEN, { ratings: [1600], speeds: ['blitz'] })).rejects.toBeInstanceOf(LichessLoginRequired);
    expect(currentLichessSession()).toBeUndefined();
  });

  it('reports any other non-2xx status by number instead of a JSON parse error', async () => {
    storeSession();
    const fetchImpl: LichessFetchImpl = vi.fn(async () => new Response('<html>oops</html>', { status: 503 }));
    configureLichessFetch({ fetchImpl });
    await expect(explorerMoves(FEN, { ratings: [1600], speeds: ['blitz'] })).rejects.toThrow(/HTTP 503/);
    expect(currentLichessSession()).toBeDefined();
  });

  it('rejects a 2xx body that is not in the explorer shape, so no NaN ever reaches the UI', async () => {
    storeSession();
    const fetchImpl: LichessFetchImpl = vi.fn(async () => jsonResponse(200, { white: 1, draws: 0, black: 0, moves: 'nope' }));
    configureLichessFetch({ fetchImpl });
    await expect(explorerMoves(FEN, { ratings: [1600], speeds: ['blitz'] })).rejects.toThrow(/expected shape/);
  });
});
