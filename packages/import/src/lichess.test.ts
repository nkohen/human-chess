import { describe, expect, it } from 'vitest';
import { fetchLatestLichessGame, fetchRecentLichessGames } from './lichess';

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
