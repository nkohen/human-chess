import { describe, expect, it, vi } from 'vitest';
import { LichessRateLimited, configureLichessFetch, type LichessFetchImpl } from '@human-chess/lichess';
import { fetchCurrentLichessGame, fetchLatestLichessGame, fetchLatestLichessGameFast, fetchLichessGames, fetchRecentLichessGames } from './lichess';

const CANNED_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcd1234"]
[White "nadavk"]
[Black "opponent"]
[Result "1-0"]
[UTCDate "2026.03.10"]
[UTCTime "18:00:00"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0
`;

function fakeFetch(status: number, body: string, headers: Record<string, string> = {}): typeof fetch {
  return (async (_url: string | URL | Request, _init?: RequestInit) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      headers: new Headers(headers),
    }) as unknown as Response) as typeof fetch;
}

describe('fetchLatestLichessGame', () => {
  it('parses the returned PGN into an ImportedGame, matching playedAs case-insensitively', async () => {
    const game = await fetchLatestLichessGame('NadavK', fakeFetch(200, CANNED_PGN));
    expect(game.source).toBe('lichess');
    expect(game.username).toBe('NadavK');
    expect(game.white).toBe('nadavk');
    expect(game.black).toBe('opponent');
    expect(game.result).toBe('1-0');
    expect(game.playedAs).toBe('white');
    expect(game.ucis).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']);
    expect(game.sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(game.startFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(game.url).toBe('https://lichess.org/abcd1234');
    expect(game.playedAt).toBe('2026-03-10T18:00:00Z');
  });

  it('rejects with a clear message on a 404 (no such user)', async () => {
    await expect(fetchLatestLichessGame('nosuchuser', fakeFetch(404, ''))).rejects.toThrow(/no lichess user/);
  });

  it('rejects with a clear message on a 429 (rate limited)', async () => {
    await expect(fetchLatestLichessGame('nadavk', fakeFetch(429, ''))).rejects.toThrow(/rate.?limited/i);
  });

  it('rejects with a clear message on an empty body (no games)', async () => {
    await expect(fetchLatestLichessGame('nadavk', fakeFetch(200, ''))).rejects.toThrow(/no games/);
  });

  it('rejects with a clear message on a game with zero moves', async () => {
    const noMovesPgn = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcd1234"]
[White "nadavk"]
[Black "opponent"]
[Result "*"]

*
`;
    await expect(fetchLatestLichessGame('nadavk', fakeFetch(200, noMovesPgn))).rejects.toThrow(/no moves/);
  });

  it('rejects with a clear message when lichess does not answer within 15 s', async () => {
    const timeoutFetch: typeof fetch = (async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    }) as unknown as typeof fetch;
    await expect(fetchLatestLichessGame('nadavk', timeoutFetch)).rejects.toThrow(/did not answer within 15 s/);
  });
});

const MULTI_GAME_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/game1"]
[White "nadavk"]
[Black "opponentA"]
[Result "1-0"]
[UTCDate "2026.03.10"]
[UTCTime "18:00:00"]

1. e4 e5 2. Nf3 1-0

[Event "Rated Blitz game"]
[Site "https://lichess.org/game2"]
[White "opponentB"]
[Black "nadavk"]
[Result "0-1"]
[UTCDate "2026.03.11"]
[UTCTime "12:00:00"]

1. d4 d5 0-1
`;

describe('fetchRecentLichessGames', () => {
  it('parses every game in the multi-game export into its own ImportedGame, newest-first as lichess sent them', async () => {
    let requestedUrl = '';
    const fetchImpl: typeof fetch = (async (url: string) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => MULTI_GAME_PGN, headers: new Headers() } as unknown as Response;
    }) as unknown as typeof fetch;

    const { games, skipped } = await fetchRecentLichessGames('nadavk', { maxGames: 50, fetchImpl });
    expect(requestedUrl).toContain('max=50');
    expect(games).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(games[0]!.white).toBe('nadavk');
    expect(games[0]!.playedAs).toBe('white');
    expect(games[1]!.black).toBe('nadavk');
    expect(games[1]!.playedAs).toBe('black');
  });

  it('skips a malformed game in the export instead of dropping the whole batch (M1)', async () => {
    const threeGamePgn = `[Event "Game 1"]
[White "nadavk"]
[Black "a"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0

[Event "Game 2 (illegal move)"]
[White "nadavk"]
[Black "b"]
[Result "0-1"]

1. e4 e5 2. Nf6 0-1

[Event "Game 3"]
[White "nadavk"]
[Black "c"]
[Result "1/2-1/2"]

1. d4 d5 1/2-1/2
`;
    const fetchImpl: typeof fetch = (async () =>
      ({ ok: true, status: 200, text: async () => threeGamePgn, headers: new Headers() }) as unknown as Response) as unknown as typeof fetch;

    const { games, skipped } = await fetchRecentLichessGames('nadavk', { maxGames: 50, fetchImpl });
    expect(games).toHaveLength(2);
    expect(skipped).toBe(1);
    expect(games[0]!.black).toBe('a');
    expect(games[1]!.black).toBe('c');
  });

  it('clamps maxGames into [1, 300] before building the request', async () => {
    let requestedUrl = '';
    const fetchImpl: typeof fetch = (async (url: string) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => '', headers: new Headers() } as unknown as Response;
    }) as unknown as typeof fetch;

    await fetchRecentLichessGames('nadavk', { maxGames: 10_000, fetchImpl });
    expect(requestedUrl).toContain('max=300');
  });

  it('returns an empty result on an empty body rather than throwing (contrast fetchLatestLichessGame)', async () => {
    const fetchImpl: typeof fetch = (async () =>
      ({ ok: true, status: 200, text: async () => '', headers: new Headers() }) as unknown as Response) as unknown as typeof fetch;
    await expect(fetchRecentLichessGames('nadavk', { maxGames: 100, fetchImpl })).resolves.toEqual({ games: [], skipped: 0 });
  });

  it('rejects with a clear message on a 404 (no such user)', async () => {
    const fetchImpl: typeof fetch = (async () =>
      ({ ok: false, status: 404, text: async () => '', headers: new Headers() }) as unknown as Response) as unknown as typeof fetch;
    await expect(fetchRecentLichessGames('nosuchuser', { maxGames: 100, fetchImpl })).rejects.toThrow(/no lichess user/);
  });
});

const THREE_GAME_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/g1"]
[White "nadavk"]
[Black "a"]
[Result "1-0"]

1. e4 e5 1-0

[Event "Rated Bullet game"]
[Site "https://lichess.org/g2"]
[White "b"]
[Black "nadavk"]
[Result "0-1"]

1. d4 d5 0-1

[Event "Rated Rapid game"]
[Site "https://lichess.org/g3"]
[White "nadavk"]
[Black "c"]
[Result "1/2-1/2"]

1. c4 c5 1/2-1/2
`;

/** A Response whose body is a real ReadableStream, split at `splitAt` — deliberately choosing a
 * split point inside the *second* "[Event " so readPgnWithIdleTimeout's carry-over handling (a
 * needle split across a chunk boundary) is actually exercised, not just the easy single-chunk
 * case. */
function streamedGamesResponse(pgn: string, splitAt: number): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(pgn.slice(0, splitAt)));
      controller.enqueue(encoder.encode(pgn.slice(splitAt)));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('fetchLichessGames', () => {
  it('reads a streamed body incrementally, reporting progress and returning every game (needle split across a chunk boundary)', async () => {
    const secondEventAt = THREE_GAME_PGN.indexOf('[Event ', THREE_GAME_PGN.indexOf('[Event ') + 1);
    const splitAt = secondEventAt + 3; // mid-way through "[Event " itself
    const fetchImpl: LichessFetchImpl = async () => streamedGamesResponse(THREE_GAME_PGN, splitAt);

    const progress: number[] = [];
    const { games, skipped } = await fetchLichessGames('nadavk', { fetchImpl, onProgress: n => progress.push(n) });

    expect(games).toHaveLength(3);
    expect(skipped).toBe(0);
    expect(games[0]!.black).toBe('a');
    expect(games[1]!.playedAs).toBe('black');
    expect(games[2]!.meta?.speed).toBe('rapid');
    // Progress is non-decreasing and ends at the true total, regardless of exactly how many
    // chunks it took to get there.
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(3);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });

  it('falls back to a whole-body text() read when the response has no readable stream', async () => {
    const fetchImpl: LichessFetchImpl = (async () =>
      ({ ok: true, status: 200, text: async () => THREE_GAME_PGN, headers: new Headers() }) as unknown as Response) as LichessFetchImpl;
    const { games, skipped } = await fetchLichessGames('nadavk', { fetchImpl });
    expect(games).toHaveLength(3);
    expect(skipped).toBe(0);
  });

  it('builds the request URL with tags/opening/perfType and the since/until/rated/max filters', async () => {
    let requestedUrl = '';
    const fetchImpl: LichessFetchImpl = async url => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => '', headers: new Headers() } as unknown as Response;
    };
    await fetchLichessGames('nadavk', { sinceMs: 1_000, untilMs: 2_000, rated: true, max: 500, fetchImpl });
    expect(requestedUrl).toContain('tags=true');
    expect(requestedUrl).toContain('opening=true');
    expect(requestedUrl).toContain('perfType=ultraBullet%2Cbullet%2Cblitz%2Crapid%2Cclassical%2Ccorrespondence');
    expect(requestedUrl).toContain('since=1000');
    expect(requestedUrl).toContain('until=2000');
    expect(requestedUrl).toContain('rated=true');
    expect(requestedUrl).toContain('max=500');
  });

  it('defaults max to 2000 and hard-caps it at 5000', async () => {
    const urls: string[] = [];
    const fetchImpl: LichessFetchImpl = async url => {
      urls.push(url);
      return { ok: true, status: 200, text: async () => '', headers: new Headers() } as unknown as Response;
    };
    await fetchLichessGames('nadavk', { fetchImpl });
    await fetchLichessGames('nadavk', { max: 999_999, fetchImpl });
    expect(urls[0]).toContain('max=2000');
    expect(urls[1]).toContain('max=5000');
  });

  it('rejects with a clear message on a 404 (no such user)', async () => {
    const fetchImpl: LichessFetchImpl = async () => new Response('', { status: 404 });
    await expect(fetchLichessGames('nosuchuser', { fetchImpl })).rejects.toThrow(/no lichess user/);
  });

  it('rejects with LichessRateLimited on a 429 from a caller-supplied fetchImpl', async () => {
    const fetchImpl: LichessFetchImpl = async () => new Response('', { status: 429 });
    await expect(fetchLichessGames('nadavk', { fetchImpl })).rejects.toBeInstanceOf(LichessRateLimited);
  });

  it('rejects with LichessRateLimited when the real lichessFetch client hits its own cooldown', async () => {
    // No _resetForTests afterward (not exported from @human-chess/lichess's public API, same as
    // packages/import/src/chesscom.test.ts's parallel test) — safe because every other test in
    // this file passes its own explicit fetchImpl rather than relying on the default lichessFetch,
    // and vitest gives each test file its own module registry.
    configureLichessFetch({ fetchImpl: async () => new Response('', { status: 429 }) });
    await expect(fetchLichessGames('nadavk')).rejects.toBeInstanceOf(LichessRateLimited);
  });

  it('rejects with the signal’s own reason when already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('caller gave up', 'AbortError'));
    const fetchImpl: LichessFetchImpl = async () => new Response('', { status: 200 });
    await expect(fetchLichessGames('nadavk', { signal: controller.signal, fetchImpl })).rejects.toThrow(/caller gave up/);
  });

  it('aborts with a clear message when lichess sends no data for the idle window (60 s)', async () => {
    vi.useFakeTimers();
    try {
      const neverResolves: LichessFetchImpl = () => new Promise<Response>(() => {});
      const promise = fetchLichessGames('nadavk', { fetchImpl: neverResolves });
      const assertion = expect(promise).rejects.toThrow(/sent no data for 60 s/);
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

const IN_PROGRESS_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/inprog99"]
[White "nadavk"]
[Black "opponent"]
[Result "*"]

1. e4 e5 2. Nf3 *
`;

const EXPORT_PGN = `[Event "Rated Blitz game"]
[Site "https://lichess.org/export77"]
[White "nadavk"]
[Black "opponent"]
[Result "0-1"]
[UTCDate "2026.03.09"]
[UTCTime "12:00:00"]

1. d4 d5 0-1
`;

/** A fetchImpl that answers the current-game and bulk-export URLs differently, recording which
 * URLs were hit so a test can assert the fallback fired (or didn't). Each route is either a
 * {status, body} response or a function that throws (to model lichessFetch throwing). */
function routingFetch(
  routes: {
    current: { status: number; body: string } | (() => never);
    export?: { status: number; body: string };
  },
  calls: string[],
): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    const route = u.includes('/current-game') ? routes.current : routes.export;
    if (!route) throw new Error(`unexpected fetch: ${u}`);
    if (typeof route === 'function') {
      route();
      throw new Error('route() should have thrown');
    }
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      text: async () => route.body,
      headers: new Headers(),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('fetchCurrentLichessGame', () => {
  it('hits the per-user current-game endpoint and parses the PGN', async () => {
    const calls: string[] = [];
    const game = await fetchCurrentLichessGame('NadavK', routingFetch({ current: { status: 200, body: CANNED_PGN } }, calls));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/api/user/NadavK/current-game');
    expect(game.result).toBe('1-0');
    expect(game.ucis).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']);
  });

  it('rejects with a clear message on a 404 (no such user)', async () => {
    await expect(fetchCurrentLichessGame('nosuchuser', routingFetch({ current: { status: 404, body: '' } }, []))).rejects.toThrow(/no lichess user/);
  });

  it('rejects with a clear message on an empty body (no current or recent game)', async () => {
    await expect(fetchCurrentLichessGame('nadavk', routingFetch({ current: { status: 200, body: '' } }, []))).rejects.toThrow(/no current or recent game/);
  });
});

describe('fetchLatestLichessGameFast', () => {
  it('returns the current game directly when it is finished, without touching the bulk export', async () => {
    const calls: string[] = [];
    const game = await fetchLatestLichessGameFast('nadavk', routingFetch({ current: { status: 200, body: CANNED_PGN }, export: { status: 200, body: EXPORT_PGN } }, calls));
    expect(game.result).toBe('1-0');
    expect(game.url).toBe('https://lichess.org/abcd1234');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/current-game');
  });

  it('falls back to the bulk export when the current game is still in progress', async () => {
    const calls: string[] = [];
    const game = await fetchLatestLichessGameFast('nadavk', routingFetch({ current: { status: 200, body: IN_PROGRESS_PGN }, export: { status: 200, body: EXPORT_PGN } }, calls));
    // The finished export game, not the in-progress current one.
    expect(game.result).toBe('0-1');
    expect(game.url).toBe('https://lichess.org/export77');
    expect(calls.some(u => u.includes('/current-game'))).toBe(true);
    expect(calls.some(u => u.includes('/api/games/user'))).toBe(true);
  });

  it('falls back to the bulk export when current-game fails (e.g. transient 500)', async () => {
    const calls: string[] = [];
    const game = await fetchLatestLichessGameFast('nadavk', routingFetch({ current: { status: 500, body: '' }, export: { status: 200, body: EXPORT_PGN } }, calls));
    expect(game.result).toBe('0-1');
    expect(calls.some(u => u.includes('/api/games/user'))).toBe(true);
  });

  it('falls back when the current game is finished but has no moves (guards the moves half)', async () => {
    const calls: string[] = [];
    const finishedNoMoves = `[Event "Rated Blitz game"]
[Site "https://lichess.org/nomoves1"]
[White "nadavk"]
[Black "opponent"]
[Result "1-0"]

1-0
`;
    const game = await fetchLatestLichessGameFast('nadavk', routingFetch({ current: { status: 200, body: finishedNoMoves }, export: { status: 200, body: EXPORT_PGN } }, calls));
    expect(game.url).toBe('https://lichess.org/export77');
    expect(calls.some(u => u.includes('/api/games/user'))).toBe(true);
  });

  it('falls back when the current game is a non-standard variant (matches the bulk perfType filter)', async () => {
    const calls: string[] = [];
    const variantPgn = `[Event "Rated Chess960 game"]
[Site "https://lichess.org/variant9"]
[Variant "Chess960"]
[White "nadavk"]
[Black "opponent"]
[Result "1-0"]

1. e4 1-0
`;
    const game = await fetchLatestLichessGameFast('nadavk', routingFetch({ current: { status: 200, body: variantPgn }, export: { status: 200, body: EXPORT_PGN } }, calls));
    expect(game.url).toBe('https://lichess.org/export77');
    expect(calls.some(u => u.includes('/api/games/user'))).toBe(true);
  });

  it('rethrows a rate-limit without spending a second request on the bulk export', async () => {
    const calls: string[] = [];
    const now = Date.now();
    const rateLimited = (): never => {
      throw new LichessRateLimited(now + 60_000, now);
    };
    await expect(
      fetchLatestLichessGameFast('nadavk', routingFetch({ current: rateLimited, export: { status: 200, body: EXPORT_PGN } }, calls)),
    ).rejects.toBeInstanceOf(LichessRateLimited);
    expect(calls.some(u => u.includes('/api/games/user'))).toBe(false);
  });
});
