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
import { toImportedGame } from './parse';
import type { ImportedGame } from './types';

const TIMEOUT_MS = 15_000;
const MAX_ARCHIVE_MONTHS = 12;

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
    });
    if (game.ucis.length === 0) {
      throw new Error(`${username}'s latest game on chess.com has no moves`);
    }
    return game;
  }

  throw new Error(`${username} has no standard chess games in the last 12 months of play on chess.com`);
}
