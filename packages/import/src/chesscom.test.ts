import { describe, expect, it } from 'vitest';
import { ChesscomRateLimited, configureChesscomFetch, type ChesscomFetchImpl, type ChesscomGame } from '@human-chess/chesscom';
import { jsonResponse } from '@human-chess/site-client/testing';
import { fetchLatestChesscomGame } from './chesscom';

const ARCHIVES_URL = 'https://api.chess.com/pub/player/nadavk/games/archives';
const month = (y: number, m: number): string => `https://api.chess.com/pub/player/nadavk/games/${y}/${String(m).padStart(2, '0')}`;

/** Routes a fake fetchImpl by exact URL, so a test only has to describe what each archive/
 * month endpoint returns. Anything not listed 404s, matching chess.com's real behaviour for an
 * archive month with no games recorded... except archives.length itself already governs which
 * months this module ever requests, so this is mostly a safety net. */
function fakeFetch(routes: Record<string, { status: number; body: unknown }>): ChesscomFetchImpl {
  return async (url: string) => {
    const route = routes[url];
    if (!route) return jsonResponse(404, {});
    return jsonResponse(route.status, route.body);
  };
}

/** A minimal valid PGN (so it parses to a non-empty ucis list, per fetchLatestChesscomGame's own
 * "has no moves" guard) carrying `label` in a movetext comment, so a test can still tell which
 * fixture game was picked via `result.pgn.includes(label)`. */
function taggedPgn(label: string): string {
  return `1. e4 e5 {${label}} *`;
}

function game(overrides: Partial<ChesscomGame> = {}): ChesscomGame {
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

// Hand-written for this test (not claimed as a real chess.com export): chess.com PGNs carry
// clock comments like `{[%clk 0:04:58.3]}` and headers such as Link/UTCDate/EndTime that a
// lichess PGN never has — parsePgnGame (chessops-backed) must parse past all of that.
const CHESSCOM_STYLE_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.03.10"]
[White "NadavK"]
[Black "opponent99"]
[Result "1-0"]
[TimeControl "300"]
[UTCDate "2026.03.10"]
[UTCTime "18:00:00"]
[WhiteElo "1500"]
[BlackElo "1490"]
[Termination "NadavK won by checkmate"]
[ECO "C50"]
[EndTime "18:05:00 PDT"]
[Link "https://www.chess.com/game/live/1"]

1. e4 {[%clk 0:04:58.3]} 1... e5 {[%clk 0:04:57.1]} 2. Bc4 {[%clk 0:04:55.0]} 2... Nc6 {[%clk 0:04:54.2]} 3. Qh5 {[%clk 0:04:50.0]} 3... Nf6 {[%clk 0:04:40.0]} 4. Qxf7# {[%clk 0:04:35.0]} 1-0
`;

describe('fetchLatestChesscomGame', () => {
  it('picks the game with the greatest end_time among the newest month with a standard game', async () => {
    const fetchImpl = fakeFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 1), month(2026, 2)] } },
      [month(2026, 2)]: {
        status: 200,
        body: { games: [game({ end_time: 100, pgn: taggedPgn('older') }), game({ end_time: 200, pgn: taggedPgn('newer') })] },
      },
    });

    const result = await fetchLatestChesscomGame('nadavk', fetchImpl);
    expect(result.source).toBe('chess.com');
    expect(result.pgn).toContain('newer');
  });

  it('skips a non-standard game (chess960) even when it has a later end_time, picking an older standard game', async () => {
    const fetchImpl = fakeFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 3)] } },
      [month(2026, 3)]: {
        status: 200,
        body: {
          games: [
            game({ end_time: 300, rules: 'chess960', pgn: 'variant-newer' }),
            game({ end_time: 100, rules: 'chess', pgn: taggedPgn('standard-older') }),
          ],
        },
      },
    });

    const result = await fetchLatestChesscomGame('nadavk', fetchImpl);
    expect(result.pgn).toContain('standard-older');
  });

  it('walks to the previous month when the newest month has no standard game', async () => {
    const fetchImpl = fakeFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 1), month(2026, 2)] } },
      [month(2026, 2)]: { status: 200, body: { games: [game({ rules: 'bughouse', pgn: 'not-standard' })] } },
      [month(2026, 1)]: { status: 200, body: { games: [game({ pgn: taggedPgn('standard-prev-month') })] } },
    });

    const result = await fetchLatestChesscomGame('nadavk', fetchImpl);
    expect(result.pgn).toContain('standard-prev-month');
  });

  it('walks to the previous month when the newest month has an empty games list', async () => {
    const fetchImpl = fakeFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 1), month(2026, 2)] } },
      [month(2026, 2)]: { status: 200, body: { games: [] } },
      [month(2026, 1)]: { status: 200, body: { games: [game({ pgn: taggedPgn('standard-prev-month') })] } },
    });

    const result = await fetchLatestChesscomGame('nadavk', fetchImpl);
    expect(result.pgn).toContain('standard-prev-month');
  });

  it('picks the first game in array order when two standard games share the same end_time (documented tie-break)', async () => {
    const fetchImpl = fakeFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 3)] } },
      [month(2026, 3)]: {
        status: 200,
        body: {
          games: [game({ end_time: 500, pgn: taggedPgn('first-at-500') }), game({ end_time: 500, pgn: taggedPgn('second-at-500') })],
        },
      },
    });

    const result = await fetchLatestChesscomGame('nadavk', fetchImpl);
    expect(result.pgn).toContain('first-at-500');
  });

  it('gives up after 12 archive months with no standard game, without fetching the 13th (oldest)', async () => {
    // 13 consecutive months, oldest first (as chess.com returns them): 2025-01 .. 2026-01.
    const archives = Array.from({ length: 13 }, (_, i) => month(2025 + Math.floor(i / 12), (i % 12) + 1));
    const fetchedUrls: string[] = [];
    const routes: Record<string, { status: number; body: unknown }> = {
      [ARCHIVES_URL]: { status: 200, body: { archives } },
    };
    for (const url of archives) {
      routes[url] = { status: 200, body: { games: [game({ rules: 'crazyhouse' })] } };
    }
    const fetchImpl: ChesscomFetchImpl = async (url: string) => {
      fetchedUrls.push(url);
      const route = routes[url];
      if (!route) return new Response('', { status: 404 });
      return jsonResponse(route.status, route.body);
    };

    await expect(fetchLatestChesscomGame('nadavk', fetchImpl)).rejects.toThrow(
      /nadavk has no standard chess games in the last 12 months/,
    );
    // Archives call, plus the 12 most recent months only — the oldest (2025-01) is never fetched.
    expect(fetchedUrls).toContain(ARCHIVES_URL);
    expect(fetchedUrls).not.toContain(month(2025, 1));
    expect(fetchedUrls.length).toBe(1 + 12);
  });

  it('rejects with a clear message when archives are empty (user exists, no games)', async () => {
    const fetchImpl = fakeFetch({ [ARCHIVES_URL]: { status: 200, body: { archives: [] } } });
    await expect(fetchLatestChesscomGame('nadavk', fetchImpl)).rejects.toThrow(/nadavk has no games on chess\.com/);
  });

  it('rejects with a clear message on a 404 (no such user)', async () => {
    const fetchImpl = fakeFetch({});
    await expect(fetchLatestChesscomGame('nosuchuser', fetchImpl)).rejects.toThrow(/no chess\.com user "nosuchuser"/);
  });

  it('surfaces a rate-limit error from the archives call as-is', async () => {
    // Goes through the real (default) chesscomFetch rather than a raw test fetchImpl, since a
    // 429 only becomes ChesscomRateLimited inside the site client itself (the same reason
    // packages/import/src/lichess.ts keeps its own explicit 429 check for caller-supplied
    // fetchImpls that hand back a raw 429 Response directly).
    configureChesscomFetch({ fetchImpl: async () => new Response('', { status: 429 }) });
    await expect(fetchLatestChesscomGame('nadavk')).rejects.toBeInstanceOf(ChesscomRateLimited);
  });

  it('parses a chess.com-style PGN (clock comments, Link/UTCDate/EndTime headers) into the right ucis and playedAs', async () => {
    const fetchImpl = fakeFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 3)] } },
      [month(2026, 3)]: { status: 200, body: { games: [game({ pgn: CHESSCOM_STYLE_PGN, end_time: 500 })] } },
    });

    // Case-insensitive match against the PGN's "NadavK" White header.
    const result = await fetchLatestChesscomGame('nadavk', fetchImpl);
    expect(result.white).toBe('NadavK');
    expect(result.black).toBe('opponent99');
    expect(result.playedAs).toBe('white');
    expect(result.ucis).toEqual(['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']);
    expect(result.username).toBe('nadavk');
    expect(result.source).toBe('chess.com');
  });

  it('rejects a game whose PGN has no moves, with a message parallel to lichess.ts', async () => {
    const noMovesPgn = `[Event "Live Chess"]
[White "NadavK"]
[Black "opponent99"]
[Result "*"]

*
`;
    const fetchImpl = fakeFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 3)] } },
      [month(2026, 3)]: { status: 200, body: { games: [game({ pgn: noMovesPgn })] } },
    });

    await expect(fetchLatestChesscomGame('nadavk', fetchImpl)).rejects.toThrow(
      /nadavk's latest game on chess\.com has no moves/,
    );
  });
});
