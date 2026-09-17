// A thin localStorage cache in front of chesscomFetch (same shape as packages/lichess's
// cache.ts), sharing fetch.ts's single chess.com client so caching sits on top of the same
// queue/cooldown state chesscomFetch itself uses. Storage key prefix:
// `human-chess.chesscom.cache.v1:`.
import { _chesscomClient, type ChesscomFetchImpl } from './fetch';

/** Removes every entry this module has cached. */
export function clearChesscomCache(): void {
  _chesscomClient.clearCache();
}

/**
 * GETs `url` (through chesscomFetch by default) and caches a successful (2xx) response body as
 * text for `ttlMs`. A cache hit returns synchronously-resolved cached text with no network call
 * and no queue interaction.
 */
export async function cachedChesscomText(
  url: string,
  ttlMs: number,
  init?: RequestInit,
  fetchImpl?: ChesscomFetchImpl,
): Promise<string> {
  return _chesscomClient.cachedText(url, ttlMs, init, fetchImpl);
}

/** Same as cachedChesscomText, but parses the body as JSON. */
export async function cachedChesscomJson<T>(
  url: string,
  ttlMs: number,
  init?: RequestInit,
  fetchImpl?: ChesscomFetchImpl,
): Promise<T> {
  return _chesscomClient.cachedJson<T>(url, ttlMs, init, fetchImpl);
}
