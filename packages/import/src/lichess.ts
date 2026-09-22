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

// lichess's per-user "current game" endpoint: a point lookup that returns the user's ongoing
// game, or — when none is in progress — the last game they played. Unlike the bulk export above
// (`/api/games/user`, which opens a filtered cursor over the whole archive even for `max=1`),
// this is a single-document read, so it returns the newest game far sooner. The trade-off it
// carries, handled by fetchLatestLichessGameFast below, is that it CAN return an in-progress
// game — which the archive export never does.
const LICHESS_USER_URL = 'https://lichess.org/api/user';

/** A finished game's PGN `Result` is one of the three decisive/drawn values; anything else
 * ("*", or a missing header) means the game is still in progress or its result is unknown. Used
 * to tell a completed game (safe to reconstruct/review) from an ongoing one. */
function isFinishedResult(result: string | undefined): boolean {
  return result === '1-0' || result === '0-1' || result === '1/2-1/2';
}

/** True for a standard-rules game (no `[Variant]` header, or `Variant "Standard"`). The
 * current-game endpoint does not perf-type-filter, so it can return a non-standard variant
 * (Chess960, Crazyhouse, …); the bulk export fetchLatestLichessGameFast falls back to DOES
 * (STANDARD_PERF_TYPES). Requiring standard here keeps the fast path's result matching the bulk
 * path's — a variant current-game just falls back rather than being reconstructed under standard
 * rules. A Chess960 game from the normal start can even parse cleanly, so filtering on the
 * declared variant (not on whether the moves happen to parse) is what actually catches it. */
function isStandardVariant(game: ImportedGame): boolean {
  const variant = game.headers.Variant;
  return variant === undefined || variant === 'Standard';
}

/**
 * `username`'s ongoing game, or their last-played game if none is in progress, via lichess's
 * `/api/user/{username}/current-game` point lookup. Same options and error shape as
 * fetchLatestLichessGame (404 -> "no lichess user", 429 -> LichessRateLimited from lichessFetch,
 * timeout -> a 15 s message), so a caller can share error handling. Note the returned game may be
 * IN PROGRESS (result "*"); callers that need a finished game should check `isFinishedResult` /
 * use fetchLatestLichessGameFast.
 */
export async function fetchCurrentLichessGame(
  username: string,
  fetchImpl: LichessFetchImpl = lichessFetch,
): Promise<ImportedGame> {
  // `tags=true` is kept (not dropped for speed) because the PGN `Result` header it carries is
  // exactly what fetchLatestLichessGameFast needs to tell a finished game from an ongoing one.
  const url = `${LICHESS_USER_URL}/${encodeURIComponent(username)}/current-game?moves=true&tags=true`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/x-chess-pgn' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof LichessRateLimited) throw err;
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('lichess did not answer within 15 s');
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
    throw new Error(`lichess current-game export failed: HTTP ${response.status}`);
  }

  const pgn = (await response.text()).trim();
  if (!pgn) {
    throw new Error(`${username} has no current or recent game on lichess`);
  }
  return toImportedGame('lichess', pgn, username);
}

/**
 * `username`'s latest FINISHED game on lichess, fast: tries the `current-game` point lookup first
 * (far lower latency than the bulk archive export) and returns it only when it's a completed,
 * standard-variant game with moves; otherwise falls back to fetchLatestLichessGame (the bulk
 * export), which only ever returns finished games and perf-type-filters to standard ones. So the
 * contract matches fetchLatestLichessGame exactly — "the newest finished standard game" — it's
 * just usually much quicker to answer.
 *
 * The fallback also absorbs any current-game hiccup (an in-progress game, an empty body, an
 * unexpected non-2xx surfaced as an Error): whatever the reason, we fall through to the reliable
 * path rather than failing. The one exception is a rate-limit: a LichessRateLimited is rethrown
 * immediately rather than spending a second request (the bulk export) that would be refused too.
 */
export async function fetchLatestLichessGameFast(
  username: string,
  fetchImpl: LichessFetchImpl = lichessFetch,
): Promise<ImportedGame> {
  try {
    const game = await fetchCurrentLichessGame(username, fetchImpl);
    if (isFinishedResult(game.result) && game.ucis.length > 0 && isStandardVariant(game)) return game;
    // In-progress, resultless, or non-standard-variant game: fall back to the newest finished
    // standard game from the archive (which fetchLatestLichessGame perf-type-filters).
  } catch (err) {
    if (err instanceof LichessRateLimited) throw err;
    // Any other current-game failure (404, timeout, transient HTTP error): fall back.
  }
  return fetchLatestLichessGame(username, fetchImpl);
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
 * Delegates to `fetchLichessGames` (2026-09-17: added for the full-history sync path, with
 * since/until/rated filters, progress reporting, and an idle timeout instead of a fixed one) —
 * this function's own contract (signature, the [1, 300] clamp, no filters) is unchanged, it just
 * no longer duplicates the fetch/parse logic.
 */
export async function fetchRecentLichessGames(
  username: string,
  { maxGames, fetchImpl = lichessFetch }: FetchRecentLichessGamesOpts,
): Promise<RecentGamesResult> {
  const max = Math.max(1, Math.min(MAX_RECENT_LICHESS_GAMES, Math.round(maxGames)));
  return fetchLichessGames(username, { max, fetchImpl });
}

export interface FetchLichessGamesOpts {
  /** Only games played at or after this instant (lichess's `since`, Unix ms). */
  sinceMs?: number;
  /** Only games played at or before this instant (lichess's `until`, Unix ms). */
  untilMs?: number;
  /** Clamped to [1, HARD_CAP_LICHESS_GAMES]. Default DEFAULT_MAX_LICHESS_GAMES. Both first
   * guesses — lichess documents no particular ceiling for this endpoint, and 2000/5000 have not
   * been measured against a real account's full history. */
  max?: number;
  /** Only rated (`true`) or only casual (`false`) games; omit for both. */
  rated?: boolean;
  /** Called with the running count of games seen so far, as PGN arrives — driven by counting
   * "[Event " occurrences in the stream (see `readPgnWithIdleTimeout`), not by fully parsing
   * each game, so it can fire well before the whole response (and the one parse pass at the end)
   * is done. */
  onProgress?: (gamesSeen: number) => void;
  signal?: AbortSignal;
  fetchImpl?: LichessFetchImpl;
}

/** Default and hard cap for `FetchLichessGamesOpts.max`. First guesses (not from lichess's own
 * docs, not measured): a full-history sync needs to ask for a lot more than the 300-game recent
 * fetch, but an unbounded `max` risks pulling someone's entire multi-year history into memory in
 * one response on a single click. */
export const DEFAULT_MAX_LICHESS_GAMES = 2000;
export const HARD_CAP_LICHESS_GAMES = 5000;

/** No bytes arriving for this long (waiting for headers, or a stall mid-stream) aborts *this
 * function's own read* of the response (see `fetchLichessGames`'s doc comment on why that's not
 * quite the same as aborting the network request through the real `@human-chess/site-client`).
 * Replaces the old fixed 30 s timeout on the multi-game export (2026-09-17): a fixed budget was
 * too tight for a big, slow pull and too generous for a truly dead connection: an idle timeout
 * resets on every chunk, so a slow-but-flowing response is never killed early while a genuinely
 * stalled one still gets caught. First guess, not measured off a real slow connection.
 *
 * Exported for display only (e.g. a settings screen that wants to show the caller "gives up after
 * 60 s idle") — nothing in this package reads it back to decide behaviour beyond the
 * `idleTimeoutController(LICHESS_GAMES_IDLE_TIMEOUT_MS)` call below. */
export const LICHESS_GAMES_IDLE_TIMEOUT_MS = 60_000;

const EVENT_HEADER_NEEDLE = '[Event ';

/** Rejects as soon as `signal` aborts (with its `reason`), racing whichever of `promise`/abort
 * comes first; `promise` itself keeps running either way. Mirrors the private `raceAbort` helper
 * in `@human-chess/site-client`'s client.ts (not exported, so not reused directly) — needed here
 * too because a caller-supplied `fetchImpl` (as in this file's own tests) may not itself respect
 * the signal it's given. */
function raceSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      v => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      e => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** An AbortSignal that fires when any of `signals` fires, carrying that signal's own `reason`,
 * plus a `dispose()` that removes every listener this attached. `{ once: true }` alone only
 * self-removes a listener on the *fire* path — on the ordinary success path (this function's
 * combined signal never fires) the listener would otherwise sit on a caller-supplied, possibly
 * long-lived `AbortSignal` for as long as that signal exists. `fetchLichessGames` calls `dispose`
 * in a `finally` block so that never happens. */
function mergeSignals(signals: (AbortSignal | undefined)[]): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const cleanups: (() => void)[] = [];
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    const onAbort = (): void => controller.abort(s.reason);
    s.addEventListener('abort', onAbort, { once: true });
    cleanups.push(() => s.removeEventListener('abort', onAbort));
  }
  return { signal: controller.signal, dispose: () => cleanups.forEach(c => c()) };
}

/** A resettable idle timer as an AbortSignal: fires (once) after `ms` of no `reset()` calls, with
 * a clear "sent no data" Error as its `reason` so a catch block can tell an idle timeout apart
 * from any other abort reason by identity (`err === idle.timeoutError`). */
function idleTimeoutController(ms: number): { signal: AbortSignal; timeoutError: Error; reset: () => void; clear: () => void } {
  const controller = new AbortController();
  const timeoutError = new Error(`lichess sent no data for ${ms / 1000} s`);
  let timer: ReturnType<typeof setTimeout>;
  const arm = (): void => {
    timer = setTimeout(() => controller.abort(timeoutError), ms);
  };
  arm();
  return {
    signal: controller.signal,
    timeoutError,
    reset: () => {
      clearTimeout(timer);
      if (!controller.signal.aborted) arm();
    },
    clear: () => clearTimeout(timer),
  };
}

/** How many (possibly overlapping-with-a-previous-chunk) occurrences of `needle` appear in
 * `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
  }
  return count;
}

/**
 * Reads `response.body` incrementally, counting `"[Event "` occurrences as a live proxy for
 * "games seen so far" (exact, since every PGN game has exactly one Event header — cheap compared
 * to actually parsing each game just to report progress) and resetting `idle` on every chunk. A
 * response with no readable stream (some environments, and this file's simpler tests) falls back
 * to a single whole-body `text()` read with no incremental progress.
 *
 * Only the last `EVENT_HEADER_NEEDLE.length - 1` characters already scanned are re-scanned per
 * chunk (not the whole accumulated text), so a needle split across a chunk boundary is still
 * counted exactly once, without the cost of re-scanning everything read so far.
 */
async function readPgnWithIdleTimeout(
  response: Response,
  idle: ReturnType<typeof idleTimeoutController>,
  combinedSignal: AbortSignal,
  onProgress: ((gamesSeen: number) => void) | undefined,
): Promise<string> {
  if (!response.body) {
    // No incremental progress on this path, but still stoppable: raced against the same combined
    // (caller + idle) signal the streaming path below uses, so a response with no readable stream
    // still respects an abort or idle timeout instead of hanging until `response.text()` settles
    // on its own.
    return raceSignal(response.text(), combinedSignal);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let carry = '';
  let gamesSeen = 0;

  try {
    while (true) {
      const result = await raceSignal(reader.read(), combinedSignal);
      idle.reset();
      if (result.done) break;
      const decoded = decoder.decode(result.value, { stream: true });
      text += decoded;
      const window = carry + decoded;
      const newMatches = countOccurrences(window, EVENT_HEADER_NEEDLE);
      if (newMatches > 0) {
        gamesSeen += newMatches;
        onProgress?.(gamesSeen);
      }
      carry = window.slice(-(EVENT_HEADER_NEEDLE.length - 1));
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    throw err;
  } finally {
    reader.releaseLock();
  }
  // Flushes the decoder's internal buffer: `{ stream: true }` above can hold back the last few
  // bytes of a multi-byte UTF-8 sequence split across a chunk boundary, waiting for its
  // continuation bytes. A final no-argument decode() with the stream ended emits whatever is left
  // buffered instead of silently dropping it.
  text += decoder.decode();
  return text;
}

/**
 * `username`'s games on lichess as one PGN export request, filtered by `sinceMs`/`untilMs`/
 * `rated` when given, with live progress via `onProgress` and an idle timeout (see
 * `LICHESS_GAMES_IDLE_TIMEOUT_MS`) instead of a fixed one — built for `syncSourceGames`'s
 * paging-by-time sync, but general enough that `fetchRecentLichessGames` now delegates to it too.
 *
 * Same error shape as the other fetchers here: 404 -> "no lichess user", 429 -> LichessRateLimited
 * (either thrown by `lichessFetch`/`@human-chess/site-client` itself for the real client, or
 * constructed here with a default cooldown for a caller-supplied `fetchImpl` that hands back a
 * raw 429 `Response` directly, same reasoning as this package's other fetchers), an idle timeout
 * -> a "sent no data" Error, `signal` abort -> that signal's own reason.
 *
 * On an abort or idle timeout, this function stops *reading* the response — it does not abort the
 * underlying network request through the real `@human-chess/site-client` client: a GET there
 * strips the caller's `signal` and serves back `response.clone()` (client.ts, ~line 312), so
 * `reader.cancel()` here only cancels this function's own tee'd branch of the stream, not the
 * transfer itself. (A caller-supplied `fetchImpl`, as in this file's own tests, can behave
 * differently — this limitation is specific to the real client.) The bytes already in flight keep
 * arriving in the background either way; this function simply returns/throws without waiting for
 * them.
 */
export async function fetchLichessGames(username: string, opts: FetchLichessGamesOpts = {}): Promise<RecentGamesResult> {
  const { sinceMs, untilMs, rated, onProgress, signal, fetchImpl = lichessFetch } = opts;
  const max = Math.max(1, Math.min(HARD_CAP_LICHESS_GAMES, Math.round(opts.max ?? DEFAULT_MAX_LICHESS_GAMES)));

  const params = new URLSearchParams({
    moves: 'true',
    tags: 'true',
    opening: 'true',
    perfType: STANDARD_PERF_TYPES,
    max: String(max),
  });
  if (sinceMs !== undefined) params.set('since', String(Math.round(sinceMs)));
  if (untilMs !== undefined) params.set('until', String(Math.round(untilMs)));
  if (rated !== undefined) params.set('rated', String(rated));
  const url = `${LICHESS_GAMES_URL}/${encodeURIComponent(username)}?${params.toString()}`;

  const idle = idleTimeoutController(LICHESS_GAMES_IDLE_TIMEOUT_MS);
  const { signal: combinedSignal, dispose: disposeCombinedSignal } = mergeSignals([signal, idle.signal]);

  try {
    let response: Response;
    try {
      response = await raceSignal(fetchImpl(url, { headers: { Accept: 'application/x-chess-pgn' }, signal: combinedSignal }), combinedSignal);
    } catch (err) {
      idle.clear();
      // Rethrown as-is: LichessRateLimited (from lichessFetch itself), idle.timeoutError (a clear
      // "sent no data" Error), or the caller's own AbortSignal reason are all already the right
      // error to surface — no message to build here.
      throw err;
    }

    if (response.status === 404) {
      idle.clear();
      throw new Error(`no lichess user "${username}"`);
    }
    if (response.status === 429) {
      idle.clear();
      // A caller-supplied fetchImpl handing back a raw 429 (bypassing lichessFetch's own cooldown
      // bookkeeping, as this file's own tests sometimes do) — a real LichessRateLimited either way,
      // just with no Retry-After to read, so it uses the same default cooldown site-client falls
      // back to when a 429 carries none.
      const now = Date.now();
      throw new LichessRateLimited(now + 60_000, now);
    }
    if (!response.ok) {
      idle.clear();
      throw new Error(`lichess game export failed: HTTP ${response.status}`);
    }

    let pgn: string;
    try {
      pgn = (await readPgnWithIdleTimeout(response, idle, combinedSignal, onProgress)).trim();
    } finally {
      idle.clear();
    }
    if (!pgn) return { games: [], skipped: 0 };
    return toImportedGames('lichess', pgn, username);
  } finally {
    // Always removes the `abort` listeners mergeSignals attached to the caller's own `signal`
    // (see mergeSignals's doc comment) — on every exit path, not just the error ones above, so a
    // long-lived caller signal never accumulates a listener per call.
    disposeCombinedSignal();
  }
}
