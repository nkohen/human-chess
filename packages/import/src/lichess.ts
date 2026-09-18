// Fetches a lichess player's most recent game through lichess's public game-export API — no
// OAuth, browser CORS is allowed. The PGN (moves, headers) lichess returns is game data,
// licensed CC0 by lichess; see memory/reuse-library.md.
import { LichessRateLimited, lichessFetch, type LichessFetchImpl } from '@human-chess/lichess';
import { toImportedGame, toImportedGames } from './parse';
import type { ImportedGame, RecentGamesResult } from './types';

const LICHESS_GAMES_URL = 'https://lichess.org/api/games/user';
// Restrict to the standard time controls so lichess itself excludes variant games (Chess960,
// Crazyhouse, ...) — parsePgnGame in @human-chess/rules also rejects an unsupported Variant
// header, but filtering server-side means we never fetch one in the first place.
const STANDARD_PERF_TYPES = 'ultraBullet,bullet,blitz,rapid,classical,correspondence';
const TIMEOUT_MS = 15_000;
// A multi-game export (up to MAX_RECENT_GAMES games' worth of PGN) is a bigger response than a
// single latest game; 15 s (tuned for one game) was too tight in manual testing of a 300-game
// pull, so fetchRecentLichessGames gets its own, longer budget. First guess, not measured off a
// real slow connection.
const RECENT_TIMEOUT_MS = 30_000;
/** Hard ceiling on `maxGames` for fetchRecentLichessGames, matching the openings builder's
 * games-tree form (subprojects/openings-builder/src/GamesTreeView.tsx) — one request either
 * way, this just bounds how much PGN text a single request/response can be. */
export const MAX_RECENT_LICHESS_GAMES = 300;

export async function fetchLatestLichessGame(
  username: string,
  fetchImpl: LichessFetchImpl = lichessFetch,
): Promise<ImportedGame> {
  const url = `${LICHESS_GAMES_URL}/${encodeURIComponent(username)}?max=1&moves=true&tags=true&perfType=${STANDARD_PERF_TYPES}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/x-chess-pgn' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // The default fetchImpl (lichessFetch) turns a 429 — and a call made during its cooldown —
    // into this error already; surface it as-is so the UI's err.message shows the real wait
    // time instead of a generic rate-limit message.
    if (err instanceof LichessRateLimited) throw err;
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('lichess did not answer within 15 s');
    }
    throw err;
  }

  if (response.status === 404) {
    throw new Error(`no lichess user "${username}"`);
  }
  // Kept even though lichessFetch (the default fetchImpl) never returns a 429 response — it
  // throws LichessRateLimited before returning — because a caller-supplied fetchImpl (as in
  // this file's own tests) can still hand back a raw 429 Response directly.
  if (response.status === 429) {
    throw new Error('lichess rate-limited this request; wait a moment and try again');
  }
  if (!response.ok) {
    throw new Error(`lichess game export failed: HTTP ${response.status}`);
  }

  const pgn = (await response.text()).trim();
  if (!pgn) {
    throw new Error(`${username} has no games on lichess`);
  }

  const game = toImportedGame('lichess', pgn, username);
  if (game.ucis.length === 0) {
    throw new Error(`${username}'s latest game on lichess has no moves`);
  }
  return game;
}

export interface FetchRecentLichessGamesOpts {
  /** Clamped to [1, MAX_RECENT_LICHESS_GAMES]. */
  maxGames: number;
  fetchImpl?: LichessFetchImpl;
}

/**
 * `username`'s most recent games on lichess, newest first, in one request — lichess's export
 * endpoint takes `max` directly, so there is no archive-walking here (contrast
 * fetchRecentChesscomGames, which has to page by month). Same error shape as
 * fetchLatestLichessGame (404/429/timeout), so a caller can share error-handling code.
 *
 * Returns `RecentGamesResult` (games + a parse-skipped count, M1) rather than a bare array: one
 * malformed game in lichess's response must not blank the whole fetch, but a caller building
 * "folded N of M" text still needs to know that M includes the games that never made it in.
 *
 * Not using `packages/site-client`'s `cachedText`/`cachedJson` localStorage-TTL helper here
 * (reviewer, M3): those helpers call the underlying fetch and hand back only the resolved body
 * text, discarding the `Response` object — this function needs `response.status` itself to
 * distinguish 404 ("no such user") from 429 (rate-limited, already has its own cooldown via
 * `lichessFetch`) from a generic HTTP failure, each with its own message, and has a test per
 * status. A cached-response variant that preserves `status` would be needed before this could
 * move onto that helper; out of scope for this fix pass. `GamesTreeView`'s own in-memory
 * per-session cache (keyed by site+username+count) already avoids refetching the *same* load
 * repeatedly, which was this item's original motivation.
 */
export async function fetchRecentLichessGames(
  username: string,
  { maxGames, fetchImpl = lichessFetch }: FetchRecentLichessGamesOpts,
): Promise<RecentGamesResult> {
  const max = Math.max(1, Math.min(MAX_RECENT_LICHESS_GAMES, Math.round(maxGames)));
  const url = `${LICHESS_GAMES_URL}/${encodeURIComponent(username)}?max=${max}&moves=true&tags=true&perfType=${STANDARD_PERF_TYPES}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/x-chess-pgn' },
      signal: AbortSignal.timeout(RECENT_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof LichessRateLimited) throw err;
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`lichess did not answer within ${RECENT_TIMEOUT_MS / 1000} s`);
    }
    throw err;
  }

  if (response.status === 404) {
    throw new Error(`no lichess user "${username}"`);
  }
  if (response.status === 429) {
    throw new Error('lichess rate-limited this request; wait a moment and try again');
  }
  if (!response.ok) {
    throw new Error(`lichess game export failed: HTTP ${response.status}`);
  }

  const pgn = (await response.text()).trim();
  if (!pgn) return { games: [], skipped: 0 };
  return toImportedGames('lichess', pgn, username);
}
