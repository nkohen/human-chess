import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, jsonResponse } from '@human-chess/site-client/testing';
import { _resetForTests, configureChesscomFetch, type ChesscomFetchImpl } from './fetch';
import { chesscomArchives, chesscomMonthlyGames, type ChesscomGame } from './endpoints';

let currentTime = 1_000_000;
// Two arbitrary month URLs — which is "newest" is the caller's decision (the `newest` opt), not
// something derived from the URL or the clock (reviewer, 2026-09-17: deciding it from the clock
// assumed chess.com buckets archive months by UTC, which is unverified).
const NEWEST_MONTH_URL = 'https://api.chess.com/pub/player/nadavk/games/2026/03';
const OLDER_MONTH_URL = 'https://api.chess.com/pub/player/nadavk/games/2026/02';

function sampleGame(overrides: Partial<ChesscomGame> = {}): ChesscomGame {
  return {
    url: 'https://www.chess.com/game/live/1',
    pgn: '1. e4 e5 *',
    time_control: '600',
    end_time: 1_700_000_000,
    rated: true,
    rules: 'chess',
    time_class: 'blitz',
    white: { username: 'nadavk', rating: 1500, result: 'win' },
    black: { username: 'opponent', rating: 1490, result: 'checkmated' },
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  currentTime = 1_000_000;
  _resetForTests();
  configureChesscomFetch({ now: () => currentTime });
});

describe('chesscomArchives', () => {
  it('returns the archive URLs and caches them for 60 s', async () => {
    const fetchImpl: ChesscomFetchImpl = vi.fn(async () => jsonResponse(200, { archives: [OLDER_MONTH_URL, NEWEST_MONTH_URL] }));
    configureChesscomFetch({ fetchImpl, now: () => currentTime });

    const archives = await chesscomArchives('nadavk');
    expect(archives).toEqual([OLDER_MONTH_URL, NEWEST_MONTH_URL]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [seenUrl] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(seenUrl).toBe('https://api.chess.com/pub/player/nadavk/games/archives');

    await chesscomArchives('nadavk');
    expect(fetchImpl).toHaveBeenCalledTimes(1); // still cached

    currentTime += 61_000;
    await chesscomArchives('nadavk');
    expect(fetchImpl).toHaveBeenCalledTimes(2); // TTL (60 s) elapsed — never hides a new month for long
  });

  it('rejects with a clear message on a 404 (no such user)', async () => {
    const fetchImpl: ChesscomFetchImpl = vi.fn(async () => jsonResponse(404, {}));
    configureChesscomFetch({ fetchImpl, now: () => currentTime });
    await expect(chesscomArchives('nosuchuser')).rejects.toThrow(/no chess\.com user "nosuchuser"/);
  });

  it('rejects when the response is not in the expected shape', async () => {
    const fetchImpl: ChesscomFetchImpl = vi.fn(async () => jsonResponse(200, { archives: [1, 2, 3] }));
    configureChesscomFetch({ fetchImpl, now: () => currentTime });
    await expect(chesscomArchives('nadavk')).rejects.toThrow(/expected shape/);
  });
});

describe('chesscomMonthlyGames', () => {
  it('returns the games for the month', async () => {
    const game = sampleGame();
    const fetchImpl: ChesscomFetchImpl = vi.fn(async () => jsonResponse(200, { games: [game] }));
    configureChesscomFetch({ fetchImpl, now: () => currentTime });

    const games = await chesscomMonthlyGames(OLDER_MONTH_URL);
    expect(games).toEqual([game]);
  });

  it('rejects when the response is not in the expected shape', async () => {
    const fetchImpl: ChesscomFetchImpl = vi.fn(async () => jsonResponse(200, { games: [{ url: 'x' }] }));
    configureChesscomFetch({ fetchImpl, now: () => currentTime });
    await expect(chesscomMonthlyGames(OLDER_MONTH_URL)).rejects.toThrow(/expected shape/);
  });

  it('returns an empty list for a month with no games, without rejecting the shape', async () => {
    const fetchImpl: ChesscomFetchImpl = vi.fn(async () => jsonResponse(200, { games: [] }));
    configureChesscomFetch({ fetchImpl, now: () => currentTime });
    await expect(chesscomMonthlyGames(OLDER_MONTH_URL)).resolves.toEqual([]);
  });

  it('caches a month for 7 days when it is not the newest', async () => {
    const fetchImpl: ChesscomFetchImpl = vi.fn(async () => jsonResponse(200, { games: [sampleGame()] }));
    configureChesscomFetch({ fetchImpl, now: () => currentTime });

    await chesscomMonthlyGames(OLDER_MONTH_URL);
    currentTime += 6 * 24 * 60 * 60 * 1000; // 6 days later, still within the 7-day TTL
    await chesscomMonthlyGames(OLDER_MONTH_URL);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    currentTime += 2 * 24 * 60 * 60 * 1000; // now past 7 days total
    await chesscomMonthlyGames(OLDER_MONTH_URL);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('caches the newest archive (opts.newest) for only 60 s', async () => {
    const fetchImpl: ChesscomFetchImpl = vi.fn(async () => jsonResponse(200, { games: [sampleGame()] }));
    configureChesscomFetch({ fetchImpl, now: () => currentTime });

    await chesscomMonthlyGames(NEWEST_MONTH_URL, { newest: true });
    currentTime += 30_000; // 30 s later, within the 60 s TTL
    await chesscomMonthlyGames(NEWEST_MONTH_URL, { newest: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    currentTime += 31_000; // now past 60 s total
    await chesscomMonthlyGames(NEWEST_MONTH_URL, { newest: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
