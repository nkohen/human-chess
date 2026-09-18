import { describe, expect, it } from 'vitest';
import type { ChesscomFetchImpl, ChesscomGame } from '@human-chess/chesscom';
import type { LichessFetchImpl } from '@human-chess/lichess';
import { jsonResponse } from '@human-chess/site-client/testing';
import { createMemoryGamesStore } from '@human-chess/store';
import type { StoredImportedGame } from './hash';
import { LICHESS_BACKFILL_WINDOW_MS, syncSourceGames } from './sync';

// --- lichess fakes -----------------------------------------------------------------------

function lichessGamePgn(opts: { site: string; date: string; time: string }): string {
  return `[Event "Rated Blitz game"]
[Site "${opts.site}"]
[White "nadavk"]
[Black "opponent"]
[Result "1-0"]
[UTCDate "${opts.date}"]
[UTCTime "${opts.time}"]

1. e4 e5 2. Nf3 Nc6 1-0
`;
}

/** Routes by the exact `since`/`until` param pair (each defaulting to the literal 'no-since' /
 * 'no-until' when absent), so a test can distinguish a first sync, a resumed forward fetch, and a
 * backfill fetch by the exact cursor values syncLichessGames computed. `responses` maps
 * `since=<val>&until=<val>` to the PGN text to hand back. */
function fakeLichessFetch(responses: Record<string, string>): LichessFetchImpl {
  return async (url: string) => {
    const parsed = new URL(url);
    const since = parsed.searchParams.get('since') ?? 'no-since';
    const until = parsed.searchParams.get('until') ?? 'no-until';
    const key = `since=${since}&until=${until}`;
    const body = responses[key];
    if (body === undefined) throw new Error(`unexpected lichess request: ${url} (routing key ${key})`);
    return new Response(body, { status: 200 });
  };
}

function gamesStore(): ReturnType<typeof createMemoryGamesStore<StoredImportedGame>> {
  return createMemoryGamesStore<StoredImportedGame>();
}

// --- chess.com fakes ---------------------------------------------------------------------

const ARCHIVES_URL = 'https://api.chess.com/pub/player/chicachoo123/games/archives';
const month = (y: number, m: number): string => `https://api.chess.com/pub/player/chicachoo123/games/${y}/${String(m).padStart(2, '0')}`;

function chesscomGame(overrides: Partial<ChesscomGame> = {}): ChesscomGame {
  return {
    url: 'https://www.chess.com/game/live/1',
    pgn: '1. e4 e5 *',
    end_time: 1_700_000_000,
    rated: true,
    rules: 'chess',
    time_class: 'blitz',
    white: { username: 'chicachoo123', rating: 1500, result: 'win' },
    black: { username: 'opponent', rating: 1490, result: 'checkmated' },
    ...overrides,
  };
}

function fakeChesscomFetch(routes: Record<string, { status: number; body: unknown }>): ChesscomFetchImpl {
  return async (url: string) => {
    const route = routes[url];
    if (!route) return jsonResponse(404, {});
    return jsonResponse(route.status, route.body);
  };
}

// --- tests -----------------------------------------------------------------------------

describe('syncSourceGames: lichess', () => {
  const source = { site: 'lichess' as const, username: 'nadavk' };

  it('first sync (no prior state) fetches with no since/until param, stores games, and sets sinceMs from the newest playedAt', async () => {
    const store = gamesStore();
    const pgn =
      lichessGamePgn({ site: 'https://lichess.org/a', date: '2026.09.01', time: '10:00:00' }) +
      '\n' +
      lichessGamePgn({ site: 'https://lichess.org/b', date: '2026.09.05', time: '10:00:00' });
    const progressCalls: number[] = [];
    // Only one route registered: with 2 games returned against maxGames 100 (fewer than
    // requested, on a first/unbounded fetch), historyComplete is set true so no backfill request
    // follows — a second, unrouted request here would fail the test.
    const fetchImpl = fakeLichessFetch({ 'since=no-since&until=no-until': pgn });

    const result = await syncSourceGames(store, source, {
      maxGames: 100,
      onProgress: p => {
        expect(p.stage).toBe('Downloading games');
        progressCalls.push(p.done);
      },
      fetchImpl,
    });

    expect(result).toEqual({ added: 2, skipped: 0, total: 2 });
    expect(progressCalls.length).toBeGreaterThan(0);
    const state = await store.getSyncState(source);
    expect(state?.lichess?.sinceMs).toBe(Date.parse('2026-09-05T10:00:00Z') + 1);
    expect(state?.lichess?.historyComplete).toBe(true);
  });

  it('second sync resumes from a look-back-adjusted since and only adds the new game', async () => {
    const store = gamesStore();
    const firstPgn = lichessGamePgn({ site: 'https://lichess.org/a', date: '2026.09.01', time: '10:00:00' });
    await syncSourceGames(store, source, { maxGames: 100, fetchImpl: fakeLichessFetch({ 'since=no-since&until=no-until': firstPgn }) });
    const afterFirst = await store.getSyncState(source);
    const storedSinceMs = afterFirst!.lichess!.sinceMs;
    // syncLichessGames backs the forward cursor off by LICHESS_BACKFILL_WINDOW_MS from the stored
    // sinceMs (see sync.ts's header/syncLichessGames doc comment) — this is the since the second
    // sync's request actually carries, not the stored cursor itself.
    const expectedSince = String(Math.max(0, storedSinceMs - LICHESS_BACKFILL_WINDOW_MS));

    const secondPgn = lichessGamePgn({ site: 'https://lichess.org/c', date: '2026.09.10', time: '10:00:00' });
    const result = await syncSourceGames(store, source, {
      maxGames: 100,
      fetchImpl: fakeLichessFetch({ [`since=${expectedSince}&until=no-until`]: secondPgn }),
    });

    expect(result).toEqual({ added: 1, skipped: 0, total: 2 });
    expect(await store.countGames(source)).toBe(2);
    const state = await store.getSyncState(source);
    expect(state?.lichess?.sinceMs).toBe(Date.parse('2026-09-10T10:00:00Z') + 1);
  });

  it('leaves sinceMs unset when the store has no playedAt to derive it from', async () => {
    const store = gamesStore();
    // A game with no UTCDate/UTCTime headers, so playedAt (and thus the cursor) stays undefined.
    const pgn = `[Event "Rated Blitz game"]
[White "nadavk"]
[Black "opponent"]
[Result "1-0"]

1. e4 e5 1-0
`;
    const result = await syncSourceGames(store, source, { maxGames: 100, fetchImpl: fakeLichessFetch({ 'since=no-since&until=no-until': pgn }) });
    expect(result.added).toBe(1);
    const state = await store.getSyncState(source);
    expect(state?.lichess).toBeUndefined();
  });

  it('resumes with a look-back window so a game that finished after the prior cursor but started before it is not missed', async () => {
    const store = gamesStore();
    const priorSinceMs = Date.parse('2026-09-10T00:00:00Z');
    // Seed prior state directly, with historyComplete already true so this test exercises only
    // the forward look-back fetch, not a follow-on backfill request.
    await store.setSyncState(source, {
      username: 'nadavk',
      lastSyncAt: '2026-09-10T00:00:00.000Z',
      lichess: { sinceMs: priorSinceMs, historyComplete: true },
    });

    // This game's own playedAt (lichess's createdAt) is a few days *before* priorSinceMs — a
    // plain `since=priorSinceMs` request would never see it (it "finished", i.e. was exported,
    // only after priorSinceMs even though it started earlier), but it is inside the 30-day
    // look-back window syncLichessGames now applies.
    const lateFinishingPgn = lichessGamePgn({ site: 'https://lichess.org/late', date: '2026.09.08', time: '00:00:00' });
    const expectedSince = String(Math.max(0, priorSinceMs - LICHESS_BACKFILL_WINDOW_MS));

    const result = await syncSourceGames(store, source, {
      maxGames: 100,
      fetchImpl: fakeLichessFetch({ [`since=${expectedSince}&until=no-until`]: lateFinishingPgn }),
    });

    expect(result.added).toBe(1);
    expect(await store.countGames(source)).toBe(1);
  });

  it('backfills older history with an until request when the store has not yet reached maxGames and history is not known complete', async () => {
    const store = gamesStore();
    const maxGames = 3;
    // Two distinct games plus a duplicate (same Site/url as the first) — lichess "returns" 3
    // items (so the first-sync exactly-max check does not fire, leaving historyComplete false),
    // but store.putGames's id dedupe only actually adds 2, so the store ends up below maxGames
    // and a backfill request should follow.
    const forwardPgn = [
      lichessGamePgn({ site: 'https://lichess.org/dup', date: '2026.09.05', time: '10:00:00' }),
      lichessGamePgn({ site: 'https://lichess.org/dup', date: '2026.09.05', time: '10:00:00' }),
      lichessGamePgn({ site: 'https://lichess.org/c', date: '2026.09.03', time: '10:00:00' }),
    ].join('\n');
    // Oldest playedAt among the forward batch is the 'c' game, 2026-09-03T10:00:00Z.
    const oldestForwardMs = Date.parse('2026-09-03T10:00:00Z');
    const backfillPgn = lichessGamePgn({ site: 'https://lichess.org/old', date: '2026.08.01', time: '10:00:00' });

    const result = await syncSourceGames(store, source, {
      maxGames,
      fetchImpl: fakeLichessFetch({
        'since=no-since&until=no-until': forwardPgn,
        [`since=no-since&until=${oldestForwardMs - 1}`]: backfillPgn,
      }),
    });

    expect(result).toEqual({ added: 3, skipped: 0, total: 3 });
    const state = await store.getSyncState(source);
    // The backfill response (1 game) is fewer than maxGames (3), so historyComplete is now true.
    expect(state?.lichess?.historyComplete).toBe(true);
    expect(state?.lichess?.oldestMs).toBe(Date.parse('2026-08-01T10:00:00Z'));
  });
});

describe('syncSourceGames: chess.com', () => {
  const source = { site: 'chess.com' as const, username: 'chicachoo123' };

  it('first sync walks every month newest-first, marks only the older month completed, and reports Month N of M', async () => {
    const store = gamesStore();
    const fetchImpl = fakeChesscomFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 1), month(2026, 2)] } },
      [month(2026, 2)]: { status: 200, body: { games: [chesscomGame({ end_time: 200, url: 'https://www.chess.com/game/live/2' })] } },
      [month(2026, 1)]: { status: 200, body: { games: [chesscomGame({ end_time: 100, url: 'https://www.chess.com/game/live/1' })] } },
    });
    const stages: string[] = [];

    const result = await syncSourceGames(store, source, {
      maxGames: 100,
      onProgress: p => stages.push(p.stage),
      fetchImpl,
    });

    expect(result).toEqual({ added: 2, skipped: 0, total: 2 });
    expect(stages).toEqual(['Month 1 of 2', 'Month 2 of 2']);
    const state = await store.getSyncState(source);
    // Only the older month (index 1, month(2026,1)) is marked complete; the newest is left open.
    expect(state?.chesscom?.completedMonths).toEqual([month(2026, 1)]);
  });

  it('persists setSyncState after each month, not only at the end', async () => {
    const store = gamesStore();
    // Archives given oldest-first (chess.com's own order); walked newest-first, so month 3 is
    // visited first (newest, never marked complete), then month 2 (older, marked complete), then
    // month 1 — for which no route is registered, so that request throws. The point under test:
    // was month 2's completion already persisted before the walk was interrupted by that throw?
    const fetchImpl = fakeChesscomFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 1), month(2026, 2), month(2026, 3)] } },
      [month(2026, 3)]: { status: 200, body: { games: [chesscomGame({ end_time: 300, url: 'https://www.chess.com/game/live/3' })] } },
      [month(2026, 2)]: { status: 200, body: { games: [chesscomGame({ end_time: 200, url: 'https://www.chess.com/game/live/2' })] } },
    });

    await expect(syncSourceGames(store, source, { maxGames: 100, fetchImpl })).rejects.toThrow();

    const state = await store.getSyncState(source);
    expect(state?.chesscom?.completedMonths).toEqual([month(2026, 2)]);
  });

  it('a second sync re-fetches only the still-open newest month, skipping the completed one', async () => {
    const store = gamesStore();
    const firstFetch = fakeChesscomFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 1), month(2026, 2)] } },
      [month(2026, 2)]: { status: 200, body: { games: [chesscomGame({ end_time: 200, url: 'https://www.chess.com/game/live/2' })] } },
      [month(2026, 1)]: { status: 200, body: { games: [chesscomGame({ end_time: 100, url: 'https://www.chess.com/game/live/1' })] } },
    });
    await syncSourceGames(store, source, { maxGames: 100, fetchImpl: firstFetch });

    // The second fetchImpl has no route for month(2026,1) at all: if syncSourceGames requested
    // it, this fake would throw a 404 Response and toImportedGame would never even run (the
    // request itself is the thing under test) — so a passing test proves the month was skipped.
    const secondFetch = fakeChesscomFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 1), month(2026, 2)] } },
      [month(2026, 2)]: {
        status: 200,
        body: {
          games: [
            chesscomGame({ end_time: 200, url: 'https://www.chess.com/game/live/2' }),
            chesscomGame({ end_time: 250, url: 'https://www.chess.com/game/live/3' }),
          ],
        },
      },
    });

    const result = await syncSourceGames(store, source, { maxGames: 100, fetchImpl: secondFetch });
    expect(result).toEqual({ added: 1, skipped: 0, total: 3 });
    expect(await store.countGames(source)).toBe(3);
  });

  it('stops once countGames reaches maxGames, without walking further months', async () => {
    const store = gamesStore();
    const fetchImpl = fakeChesscomFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 1), month(2026, 2)] } },
      [month(2026, 2)]: { status: 200, body: { games: [chesscomGame({ end_time: 200, url: 'https://www.chess.com/game/live/2' })] } },
      // No route for month(2026,1): reaching it would throw (fakeChesscomFetch 404s, which
      // chesscomMonthlyGames would surface as a shape error) if maxGames didn't stop the walk.
    });

    const result = await syncSourceGames(store, source, { maxGames: 1, fetchImpl });
    expect(result.total).toBe(1);
  });

  it('skips a malformed game in a month instead of dropping the rest of it', async () => {
    const store = gamesStore();
    const fetchImpl = fakeChesscomFetch({
      [ARCHIVES_URL]: { status: 200, body: { archives: [month(2026, 3)] } },
      [month(2026, 3)]: {
        status: 200,
        body: {
          games: [
            chesscomGame({ end_time: 100, url: 'https://www.chess.com/game/live/1' }),
            // An illegal second move — parseSan fails, throwing RulesError (same fixture as
            // chesscom.test.ts's own "skips a malformed game" case).
            chesscomGame({ end_time: 200, pgn: '1. e4 e5 2. Nf6 *', url: 'https://www.chess.com/game/live/2' }),
          ],
        },
      },
    });

    const result = await syncSourceGames(store, source, { maxGames: 100, fetchImpl });
    expect(result).toEqual({ added: 1, skipped: 1, total: 1 });
  });
});
