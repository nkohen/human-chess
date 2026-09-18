// Fetches a chess.com player's most recent standard (rules === 'chess') game through chess.com's
// Published-Data API — no login, browser CORS is allowed (packages/chesscom/src/fetch.ts's
// header comment has the verified policy notes). Unlike lichess, chess.com has no "latest game"
// endpoint: games are only listable a month at a time, so this walks the player's monthly
// archives newest-first until it finds a standard game, giving up after 12 months of play.
import {
  ChesscomRateLimited,
  chesscomArchives,
  chesscomFetch,
  chesscomMonthlyGames,
  type ChesscomFetchImpl,
  type ChesscomGame,
} from '@human-chess/chesscom';
import { RulesError } from '@human-chess/rules';
import { toImportedGame, type ImportedGameOverrides } from './parse';
import type { GameSpeed, ImportedGame, RecentGamesResult } from './types';

const TIMEOUT_MS = 15_000;
const MAX_ARCHIVE_MONTHS = 12;
// fetchRecentChesscomGames pages by month (chess.com has no "give me N games" endpoint), so a
// cap keeps a sparse or new account from walking years of empty months while a caller asks for
// 300 games — each month is its own serialized request (packages/site-client's one-at-a-time
// queue), so the cap is also the fetch's worst-case request count (1 archives call + this many
// month calls). Lowered from 36 to 12 (reviewer, 2026-09-17): a year of monthly archive requests
// is already a lot of serialized round-trips for one "Load" click, and a player inactive for
// over a year on a given site is a much rarer case than the request-count cost of covering them
// by default. First guess either way, not derived from real usage data; still not measured.
const MAX_RECENT_ARCHIVE_MONTHS = 12;
/** Matches the openings builder's games-tree form
 * (subprojects/openings-builder/src/GamesTreeView.tsx) — one archive request per month either
 * way, this just bounds how many games a single fetchRecentChesscomGames call can return. */
export const MAX_RECENT_CHESSCOM_GAMES = 300;

/** Runs one archives/monthly-games call with a 15 s timeout, surfacing a clear message on
 * timeout and passing a rate-limit error through as-is (same shape as fetchLatestLichessGame). */
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  try {
    return await run(AbortSignal.timeout(TIMEOUT_MS));
  } catch (err) {
    if (err instanceof ChesscomRateLimited) throw err;
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('chess.com did not answer within 15 s');
    }
    throw err;
  }
}

/** The most recent (by end_time) standard game among `games`, or undefined if none is standard
 * (chess960, bughouse, kingofthehill, threecheck, and crazyhouse are all excluded — parsePgnGame
 * in @human-chess/rules only represents standard chess and Chess960 from a starting position).
 *
 * Tie-break: strict `>` means the *first* game in array order reaching the maximum `end_time`
 * wins — a later game with an equal `end_time` does not replace it. chess.com's own array order
 * is itself unspecified for same-second finishes, so this is "deterministic given the array
 * chess.com returned," not "deterministic given the pair of games" (reviewer, 2026-09-17). */
/** chess.com's `time_class` -> our `GameSpeed`: the three timed classes keep their name,
 * `daily` (untimed, correspondence-style play) maps to `correspondence`; anything else
 * (an undocumented future value) is left undefined rather than guessed. */
function speedFromTimeClass(timeClass: string | undefined): GameSpeed | undefined {
  switch (timeClass) {
    case 'bullet':
    case 'blitz':
    case 'rapid':
      return timeClass;
    case 'daily':
      return 'correspondence';
    default:
      return undefined;
  }
}

/** chess.com's own JSON fields win over whatever the game's PGN headers say (parse.ts's
 * ImportedGameOverrides doc): `time_class`/`rated` are always present per ChesscomGame's own
 * (partial) typing being optional only because this app doesn't strictly validate them, and
 * white/black ratings come from the per-colour result objects. Exported (2026-09-17) so
 * sync.ts's month-by-month chess.com sync can build the same per-game overrides this file's own
 * fetchers use, without duplicating the mapping. */
export function chesscomMetaOverrides(game: ChesscomGame): ImportedGameOverrides['meta'] {
  return {
    speed: speedFromTimeClass(game.time_class),
    rated: game.rated,
    whiteElo: game.white?.rating,
    blackElo: game.black?.rating,
  };
}

function latestStandardGame(games: ChesscomGame[]): ChesscomGame | undefined {
  let best: ChesscomGame | undefined;
  for (const game of games) {
    if (game.rules !== 'chess') continue;
    if (!best || game.end_time > best.end_time) best = game;
  }
  return best;
}

export async function fetchLatestChesscomGame(
  username: string,
  fetchImpl: ChesscomFetchImpl = chesscomFetch,
): Promise<ImportedGame> {
  const archives = await withTimeout(signal => chesscomArchives(username, { signal, fetchImpl }));
  if (archives.length === 0) {
    throw new Error(`${username} has no games on chess.com`);
  }

  // Archives come back oldest-first; walk newest-first so the latest game is found in as few
  // months as possible, capped at MAX_ARCHIVE_MONTHS. Only the true newest archive (index 0 of
  // newestFirst) is told `newest: true` — that's the only one chess.com's own cache-control
  // treats as still-changing; every other month is immutable once written.
  const newestFirst = [...archives].reverse().slice(0, MAX_ARCHIVE_MONTHS);

  for (const [i, archiveUrl] of newestFirst.entries()) {
    const games = await withTimeout(signal =>
      chesscomMonthlyGames(archiveUrl, { signal, fetchImpl, newest: i === 0 }),
    );
    const latest = latestStandardGame(games);
    if (!latest) continue;
    // The Published-Data API's own url/end_time are structured and always present (end_time is
    // a required field per ChesscomGame), so they're preferred over parsing them back out of the
    // PGN's Link/UTCDate/UTCTime headers, which not every chess.com game type carries.
    const game = toImportedGame('chess.com', latest.pgn, username, {
      url: latest.url,
      playedAt: new Date(latest.end_time * 1000).toISOString(),
      meta: chesscomMetaOverrides(latest),
    });
    if (game.ucis.length === 0) {
      throw new Error(`${username}'s latest game on chess.com has no moves`);
    }
    return game;
  }

  throw new Error(`${username} has no standard chess games in the last 12 months of play on chess.com`);
}

export interface FetchRecentChesscomGamesOpts {
  /** Clamped to [1, MAX_RECENT_CHESSCOM_GAMES]. */
  maxGames: number;
  fetchImpl?: ChesscomFetchImpl;
}

/**
 * `username`'s most recent standard games on chess.com, newest first, walking monthly archives
 * newest-first (one request per month) until `maxGames` is reached or MAX_RECENT_ARCHIVE_MONTHS
 * months have been walked with nothing left to find. Non-standard games (chess960, bughouse,
 * ...) are skipped, same filter as fetchLatestChesscomGame.
 *
 * Returns `RecentGamesResult` (games + a parse-skipped count, M1): each month's games are
 * converted one at a time, catching RulesError individually, so one malformed game does not
 * abort the whole fetch (and drop every other month already collected) the way an unhandled
 * throw from `toImportedGame` would.
 */
export async function fetchRecentChesscomGames(
  username: string,
  { maxGames, fetchImpl = chesscomFetch }: FetchRecentChesscomGamesOpts,
): Promise<RecentGamesResult> {
  const max = Math.max(1, Math.min(MAX_RECENT_CHESSCOM_GAMES, Math.round(maxGames)));
  const archives = await withTimeout(signal => chesscomArchives(username, { signal, fetchImpl }));
  if (archives.length === 0) return { games: [], skipped: 0 };

  const newestFirst = [...archives].reverse().slice(0, MAX_RECENT_ARCHIVE_MONTHS);
  const games: ImportedGame[] = [];
  let skipped = 0;

  for (const [i, archiveUrl] of newestFirst.entries()) {
    if (games.length >= max) break;
    const monthGames = await withTimeout(signal =>
      chesscomMonthlyGames(archiveUrl, { signal, fetchImpl, newest: i === 0 }),
    );
    // chess.com returns a month's games oldest-first; reverse so this month's games are also
    // walked newest-first, matching the newest-first contract across the whole result.
    const standardNewestFirst = monthGames.filter(g => g.rules === 'chess').reverse();
    for (const g of standardNewestFirst) {
      if (games.length >= max) break;
      try {
        games.push(
          toImportedGame('chess.com', g.pgn, username, {
            url: g.url,
            playedAt: new Date(g.end_time * 1000).toISOString(),
            meta: chesscomMetaOverrides(g),
          }),
        );
      } catch (err) {
        if (!(err instanceof RulesError)) throw err;
        skipped += 1;
      }
    }
  }

  return { games, skipped };
}
