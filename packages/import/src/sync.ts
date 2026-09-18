// Drives a GamesStore (packages/store) from either site's fetchers, resuming from where the
// last sync left off rather than re-downloading a whole history every time. Neither site's
// resumption is a plain cursor:
//
// - lichess: `since`/`until` filter by a game's *createdAt* (== this package's `playedAt`, the
//   PGN's UTCDate/UTCTime), not when it finished — so a slow-finishing game (most obviously a
//   correspondence game, but any game left open a while) can start before a stored cursor and
//   only appear in the export once it finishes, after that cursor; a plain "cursor = newest seen
//   + 1ms" scheme permanently misses it. Fixed 2026-09-17 with a look-back window on the forward
//   fetch plus a separate backward "backfill" pass — see `syncLichessGames`.
// - chess.com: a set of "fully pulled" months (its Published-Data API has no time cursor, only
//   whole monthly archives).
import { chesscomArchives, chesscomMonthlyGames, type ChesscomGame } from '@human-chess/chesscom';
import { RulesError } from '@human-chess/rules';
import type { SiteFetchImpl } from '@human-chess/site-client';
import type { GameSource, GamesStore, SyncState } from '@human-chess/store';
import { chesscomMetaOverrides } from './chesscom';
import { toStoredGame, type StoredImportedGame } from './hash';
import { fetchLichessGames } from './lichess';
import { toImportedGame } from './parse';
import type { ImportedGame } from './types';

export interface SyncProgress {
  /** "Downloading games" for lichess (one request, or two when a backfill request runs — see
   * syncLichessGames); "Month N of M" for chess.com (one request per archive month walked,
   * including months skipped because they're already in `completedMonths` — so the progress bar
   * still reflects the whole walk, not just the months that made a network request). */
  stage: string;
  done: number;
  total?: number;
}

export interface SyncSourceGamesOpts {
  /** Stop once the store holds at least this many games for `source` (checked before each unit
   * of work — one lichess request, one chess.com month — so this is a floor the sync stops at
   * once crossed, not a hard per-call fetch limit). */
  maxGames: number;
  onProgress?: (progress: SyncProgress) => void;
  signal?: AbortSignal;
  /** Same shape for both sites (`SiteFetchImpl` — `LichessFetchImpl`/`ChesscomFetchImpl` are
   * both literally that alias), so one override works whichever site `source` names. */
  fetchImpl?: SiteFetchImpl;
}

export interface SyncSourceGamesResult {
  /** Games newly added to the store by this call (GamesStore.putGames's own return, summed
   * across every request made). */
  added: number;
  /** Games the fetch found but could not parse (RulesError while converting one game), same
   * meaning as RecentGamesResult.skipped elsewhere in this package. */
  skipped: number;
  /** The store's total game count for `source` after this sync (store.countGames), not just
   * what this call added — a caller reporting "N games synced" wants this, not `added`. */
  total: number;
}

/**
 * Syncs `source`'s games into `store`, resuming from `store.getSyncState(source)` rather than
 * re-fetching everything. See this file's header comment for why neither site's resumption is a
 * plain cursor; `syncLichessGames`/`syncChesscomGames` below have the per-site mechanics.
 */
export async function syncSourceGames(
  store: GamesStore<StoredImportedGame>,
  source: GameSource,
  opts: SyncSourceGamesOpts,
): Promise<SyncSourceGamesResult> {
  if (source.site === 'lichess') {
    return syncLichessGames(store, source, opts);
  }
  return syncChesscomGames(store, source, opts);
}

/** How far to back off the forward fetch's `since` from the stored cursor on a resumed sync, to
 * re-catch a game whose `playedAt` (createdAt) is before the cursor but that only finished (and
 * so only became visible in lichess's export) after it — see this file's header comment. First
 * guess, not measured against a real slow game's actual createdAt-to-finish gap; the overlap this
 * creates costs nothing beyond the one extra request, since `store.putGames` dedupes by id. */
export const LICHESS_BACKFILL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** The earliest `playedAt` among `games`, as epoch ms, or undefined if none carry one. */
function oldestPlayedAtMs(games: ImportedGame[]): number | undefined {
  let oldest: number | undefined;
  for (const g of games) {
    if (g.playedAt === undefined) continue;
    const ms = Date.parse(g.playedAt);
    if (oldest === undefined || ms < oldest) oldest = ms;
  }
  return oldest;
}

function pickOlder(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

/**
 * Lichess sync: a forward fetch from a look-back-adjusted cursor (see
 * `LICHESS_BACKFILL_WINDOW_MS`), then — only when the store still has fewer than `maxGames` for
 * `source` and the account's full history isn't already known reached — one backward "backfill"
 * fetch with `until` set to just before the oldest game seen so far. This is what makes the sync
 * actually resumable across an account with more history than `maxGames`: without the backfill
 * leg, a first sync that hit its cap would never come back for the older games, since the forward
 * cursor only ever moves forward from that point on.
 *
 * `historyComplete` is set from a response's own game count (`< max` requested means lichess had
 * nothing more to give in that direction) only for the two fetches where that's a meaningful
 * signal: the first sync's forward fetch (no `since` at all, so it's the account's newest `max`
 * games unbounded — fewer than `max` means the whole history fit) and the backfill fetch itself
 * (explicitly walking backward via `until`, so fewer than `max` means it hit the actual first
 * game). A *resumed* forward fetch (bounded by a `since` cursor) returning fewer than `max` just
 * means few games have been played recently, so it's never treated as a completeness signal,
 * and `historyComplete` is otherwise carried over from the prior sync (never reset to false, only
 * ever set to true).
 */
async function syncLichessGames(
  store: GamesStore<StoredImportedGame>,
  source: GameSource,
  opts: SyncSourceGamesOpts,
): Promise<SyncSourceGamesResult> {
  const { maxGames, onProgress, signal, fetchImpl } = opts;
  const priorState = await store.getSyncState(source);
  const priorLichess = priorState?.lichess;
  const isFirstSync = priorLichess === undefined;

  const forwardSinceMs = priorLichess !== undefined ? Math.max(0, priorLichess.sinceMs - LICHESS_BACKFILL_WINDOW_MS) : undefined;

  const forward = await fetchLichessGames(source.username, {
    ...(forwardSinceMs !== undefined ? { sinceMs: forwardSinceMs } : {}),
    max: maxGames,
    onProgress: done => onProgress?.({ stage: 'Downloading games', done }),
    ...(signal ? { signal } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  let added = await store.putGames(source, forward.games.map(toStoredGame));
  let skipped = forward.skipped;

  let oldestMs = pickOlder(priorLichess?.oldestMs, oldestPlayedAtMs(forward.games));
  let historyComplete = priorLichess?.historyComplete ?? false;
  if (isFirstSync && forward.games.length + forward.skipped < maxGames) {
    historyComplete = true;
  }

  const totalAfterForward = await store.countGames(source);
  if (totalAfterForward < maxGames && !historyComplete && oldestMs !== undefined) {
    const backfill = await fetchLichessGames(source.username, {
      untilMs: oldestMs - 1,
      max: maxGames,
      onProgress: done => onProgress?.({ stage: 'Downloading games', done }),
      ...(signal ? { signal } : {}),
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    added += await store.putGames(source, backfill.games.map(toStoredGame));
    skipped += backfill.skipped;
    oldestMs = pickOlder(oldestMs, oldestPlayedAtMs(backfill.games));
    if (backfill.games.length + backfill.skipped < maxGames) {
      historyComplete = true;
    }
  }

  await setLichessSyncState(store, source, oldestMs, historyComplete);
  const total = await store.countGames(source);
  return { added, skipped, total };
}

/** Sets `sinceMs` to the store's newest playedAt + 1 ms (never fabricated), carrying `oldestMs`/
 * `historyComplete` along with it; leaves the whole `lichess` field unset when the store has no
 * playedAt to derive a cursor from (e.g. a store with games but none carrying a known playedAt —
 * same edge case `oldestMs`/`historyComplete` would be meaningless for anyway). */
async function setLichessSyncState(
  store: GamesStore<StoredImportedGame>,
  source: GameSource,
  oldestMs: number | undefined,
  historyComplete: boolean,
): Promise<void> {
  const newestPlayedAt = await store.newestPlayedAt(source);
  const state: SyncState = {
    username: source.username,
    lastSyncAt: new Date().toISOString(),
    ...(newestPlayedAt !== undefined
      ? {
          lichess: {
            sinceMs: Date.parse(newestPlayedAt) + 1,
            ...(oldestMs !== undefined ? { oldestMs } : {}),
            ...(historyComplete ? { historyComplete } : {}),
          },
        }
      : {}),
  };
  await store.setSyncState(source, state);
}

async function syncChesscomGames(
  store: GamesStore<StoredImportedGame>,
  source: GameSource,
  opts: SyncSourceGamesOpts,
): Promise<SyncSourceGamesResult> {
  const { maxGames, onProgress, signal, fetchImpl } = opts;
  const priorState = await store.getSyncState(source);
  const completedMonths = new Set(priorState?.chesscom?.completedMonths ?? []);

  const endpointOpts = { ...(signal ? { signal } : {}), ...(fetchImpl ? { fetchImpl } : {}) };
  const archives = await chesscomArchives(source.username, endpointOpts);
  // chess.com returns archives oldest-first; walk newest-first so a capped `maxGames` sync
  // pulls recent games first, same convention as fetchRecentChesscomGames. Unlike that function,
  // there is deliberately no month cap here beyond `maxGames` itself (the 12-month cap on
  // fetchRecentChesscomGames stays local to that one-shot fetch, per the task's instruction).
  const newestFirst = [...archives].reverse();

  let added = 0;
  let skipped = 0;

  for (const [i, archiveUrl] of newestFirst.entries()) {
    if ((await store.countGames(source)) >= maxGames) break;
    const isNewest = i === 0;
    onProgress?.({ stage: `Month ${i + 1} of ${newestFirst.length}`, done: i + 1, total: newestFirst.length });
    // The newest month is never in completedMonths (see the comment below), so this only ever
    // skips an older month already fully pulled by a previous sync — no request made for it.
    if (!isNewest && completedMonths.has(archiveUrl)) continue;

    const monthGames = await chesscomMonthlyGames(archiveUrl, { ...endpointOpts, newest: isNewest });
    const { imported, monthSkipped } = convertChesscomMonth(monthGames, source.username);
    skipped += monthSkipped;
    added += await store.putGames(source, imported.map(toStoredGame));
    // Never mark the newest month complete: chess.com keeps adding games to it as the player
    // keeps playing, so the next sync must always re-check it (putGames's own dedupe by id
    // makes that cheap — every already-stored game in it is a no-op).
    if (!isNewest) completedMonths.add(archiveUrl);

    // Persisted after each month (not only once at the end): a sync interrupted partway through
    // a long walk (abort, tab close, a mid-walk fetch failure) keeps the months it already fully
    // pulled marked complete, instead of re-walking them all again next time.
    await store.setSyncState(source, {
      username: source.username,
      lastSyncAt: new Date().toISOString(),
      chesscom: { completedMonths: [...completedMonths] },
    });
  }

  const total = await store.countGames(source);
  return { added, skipped, total };
}

/** Standard (non-variant) games from one chess.com month, converted with the same per-game JSON
 * overrides (url/playedAt/meta) `fetchRecentChesscomGames` applies — see chesscom.ts. A game
 * that fails to parse (RulesError) is counted in `monthSkipped` rather than aborting the month. */
function convertChesscomMonth(monthGames: ChesscomGame[], username: string): { imported: ImportedGame[]; monthSkipped: number } {
  const imported: ImportedGame[] = [];
  let monthSkipped = 0;
  for (const g of monthGames) {
    if (g.rules !== 'chess') continue;
    try {
      imported.push(
        toImportedGame('chess.com', g.pgn, username, {
          ...(g.url !== undefined ? { url: g.url } : {}),
          playedAt: new Date(g.end_time * 1000).toISOString(),
          meta: chesscomMetaOverrides(g),
        }),
      );
    } catch (err) {
      if (!(err instanceof RulesError)) throw err;
      monthSkipped += 1;
    }
  }
  return { imported, monthSkipped };
}
