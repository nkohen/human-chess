// A thin localStorage cache in front of lichessFetch, for GET responses that don't change (or
// change rarely enough that a TTL is fine) — e.g. an individual lichess puzzle by id, which is
// immutable once created. A cache hit never touches the network or the queue in fetch.ts.
//
// The cache mechanics themselves live in @human-chess/site-client (see fetch.ts's header
// comment); this module forwards to fetch.ts's single lichess client instance (`_lichessClient`)
// so caching sits on top of the same queue/cooldown state lichessFetch itself uses, rather than
// building a second, independent one. The storage key prefix stays exactly what it always was:
// `human-chess.lichess.cache.v1:`.
import { _lichessClient, type LichessFetchImpl } from './fetch';

/** Removes every entry this module has cached. */
export function clearLichessCache(): void {
  _lichessClient.clearCache();
}

/**
 * GETs `url` (through lichessFetch by default) and caches a successful (2xx) response body as
 * text for `ttlMs`. A cache hit returns synchronously-resolved cached text with no network call
 * and no queue interaction. `fetchImpl` defaults to lichessFetch; tests may override it (same
 * pattern as the fetchImpl param on fetchLatestLichessGame / fetchNextPuzzle).
 */
export async function cachedLichessText(
  url: string,
  ttlMs: number,
  init?: RequestInit,
  fetchImpl?: LichessFetchImpl,
): Promise<string> {
  return _lichessClient.cachedText(url, ttlMs, init, fetchImpl);
}

/** Same as cachedLichessText, but parses the body as JSON. */
export async function cachedLichessJson<T>(
  url: string,
  ttlMs: number,
  init?: RequestInit,
  fetchImpl?: LichessFetchImpl,
): Promise<T> {
  return _lichessClient.cachedJson<T>(url, ttlMs, init, fetchImpl);
}
