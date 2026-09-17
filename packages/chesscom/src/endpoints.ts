// Typed helpers over chess.com's Published-Data API (verified 2026-09-17 — see fetch.ts's
// header comment for the policy notes). Every response is shape-checked before being handed
// back (A1: a wrong shape throws a clear error rather than letting bad data flow silently
// through), the same pattern packages/lichess/src/explorer.ts uses for the opening explorer.
import { cachedChesscomJson } from './cache';
import { chesscomFetch, type ChesscomFetchImpl } from './fetch';

// chess.com's own response carries `cache-control: public, max-age=60` for the archives list and
// for the current month's game list (both keep changing — a new month appears, and the current
// month's games keep finishing); a past month's game list is immutable once written.
const SHORT_TTL_MS = 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface ChesscomPlayerResult {
  username: string;
  rating: number;
  result: string;
}

export interface ChesscomGame {
  /** Only these three fields are read by anything in this codebase, so only they are validated
   * below (A1: loud failure for what's actually used); the rest ride along untyped-but-optional
   * for whatever a caller might want from the raw API. */
  pgn: string;
  rules: string;
  /** Unix seconds. */
  end_time: number;
  url?: string;
  time_control?: string;
  rated?: boolean;
  time_class?: string;
  white?: ChesscomPlayerResult;
  black?: ChesscomPlayerResult;
}

interface RawArchivesResponse {
  archives: string[];
}

interface RawMonthlyGamesResponse {
  games: ChesscomGame[];
}

function isGame(v: unknown): v is ChesscomGame {
  const g = v as Record<string, unknown>;
  return (
    typeof v === 'object' && v !== null &&
    typeof g.pgn === 'string' &&
    typeof g.rules === 'string' &&
    Number.isFinite(g.end_time)
  );
}

function isArchivesResponse(v: unknown): v is RawArchivesResponse {
  const r = v as Record<string, unknown>;
  return typeof v === 'object' && v !== null && Array.isArray(r.archives) && r.archives.every(a => typeof a === 'string');
}

function isMonthlyGamesResponse(v: unknown): v is RawMonthlyGamesResponse {
  const r = v as Record<string, unknown>;
  return typeof v === 'object' && v !== null && Array.isArray(r.games) && r.games.every(isGame);
}

/** Wraps `fetchImpl` so a 404 throws `makeNotFound()` and any other non-2xx throws a generic,
 * clear error, before a caller ever tries to parse the body as JSON. */
function withStatusCheck(fetchImpl: ChesscomFetchImpl, makeNotFound: (() => Error) | undefined): ChesscomFetchImpl {
  return async (url, init) => {
    const response = await fetchImpl(url, init);
    if (response.status === 404 && makeNotFound) throw makeNotFound();
    if (!response.ok) throw new Error(`chess.com request failed: HTTP ${response.status}`);
    return response;
  };
}

export interface ChesscomEndpointOpts {
  signal?: AbortSignal;
  fetchImpl?: ChesscomFetchImpl;
}

/**
 * `username`'s archive months, oldest first, e.g.
 * `["https://api.chess.com/pub/player/{username}/games/2014/01", ...]`. Cached for 60 s
 * (chess.com's own `max-age` on this endpoint) — long enough to spare a repeat call inside one
 * import, short enough that a brand-new month at a month boundary is never hidden behind a
 * stale list (reviewer, 2026-09-17: a 1 h cache could do exactly that).
 * Throws `Error('no chess.com user "<name>"')` on a 404.
 */
export async function chesscomArchives(username: string, opts: ChesscomEndpointOpts = {}): Promise<string[]> {
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`;
  const fetchImpl = withStatusCheck(opts.fetchImpl ?? chesscomFetch, () => new Error(`no chess.com user "${username}"`));
  const init: RequestInit = opts.signal ? { signal: opts.signal } : {};
  const raw: unknown = await cachedChesscomJson(url, SHORT_TTL_MS, init, fetchImpl);
  if (!isArchivesResponse(raw)) {
    throw new Error('chess.com archives response was not in the expected shape');
  }
  return raw.archives;
}

/**
 * A month's games for the player, chronological, as chess.com returns them. Cached for 60 s
 * when the caller says this is the newest archive (`opts.newest`), 7 days otherwise.
 *
 * Whether an archive is "the newest" is the caller's call, not this function's: deciding it
 * from the current clock would assume chess.com buckets archive months by UTC, which is
 * unverified (reviewer, 2026-09-17). The importer knows this without guessing — it's simply
 * the last URL `chesscomArchives` returned — so it passes `{ newest: true }` for that one call.
 */
export async function chesscomMonthlyGames(
  archiveUrl: string,
  opts: ChesscomEndpointOpts & { newest?: boolean } = {},
): Promise<ChesscomGame[]> {
  const fetchImpl = withStatusCheck(opts.fetchImpl ?? chesscomFetch, undefined);
  const init: RequestInit = opts.signal ? { signal: opts.signal } : {};
  const ttlMs = opts.newest ? SHORT_TTL_MS : SEVEN_DAYS_MS;
  const raw: unknown = await cachedChesscomJson(archiveUrl, ttlMs, init, fetchImpl);
  if (!isMonthlyGamesResponse(raw)) {
    throw new Error('chess.com monthly games response was not in the expected shape');
  }
  return raw.games;
}
