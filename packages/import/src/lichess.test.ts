import { describe, expect, it } from 'vitest';
import { fetchLatestLichessGame } from './lichess';

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
