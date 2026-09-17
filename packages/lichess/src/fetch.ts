// lichess.org's published API policy is simple: make requests one at a time, and after
// receiving a 429 (too many requests) wait a full minute before sending anything else. This
// module is the single choke point every lichess.org (and explorer.lichess.ovh) call in the
// app passes through, so the whole app honors that policy together instead of each caller
// improvising its own throttling.
//
// The throttling/cooldown/dedupe mechanics themselves are generic (chess.com's Published-Data
// API follows the same one-at-a-time, 429-cooldown policy) and live in @human-chess/site-client
// as of 2026-09-17; this module is lichess.org's instance of that factory, kept as the same
// public API this package always had so nothing else in the app had to change.
import { createSiteClient, type SiteFetchImpl } from '@human-chess/site-client';

const AUTH_HOSTS = ['lichess.org', 'explorer.lichess.ovh'];

const client = createSiteClient({
  name: 'lichess',
  errorClassName: 'LichessRateLimited',
  storagePrefix: 'human-chess.lichess',
  authHosts: AUTH_HOSTS,
});

/** Thrown instead of sending a request while lichess's cooldown is in effect, and for a 429. */
export const LichessRateLimited = client.RateLimited;

/** Internal seam: cache.ts shares this exact client (queue, cooldown, token provider) rather
 * than constructing its own, so caching sits on top of the one queue instead of a second one. */
export const _lichessClient = client;

// Deliberately narrower than `typeof fetch` (which also accepts URL | Request): every caller in
// this codebase passes a string URL, and lichessFetch itself only accepts a string (see below) —
// so this is the type actually threaded through configureLichessFetch, cachedLichessText/Json,
// and the fetchImpl override param on fetchLatestLichessGame / fetchNextPuzzle / fetchPuzzleById.
export type LichessFetchImpl = SiteFetchImpl;

/**
 * Test-only: override the underlying fetch implementation and/or clock so fetch.test.ts and
 * cache.test.ts can run against a fake fetch and a fake clock instead of hitting lichess.org.
 * Production code never calls this.
 */
export function configureLichessFetch(opts: { fetchImpl?: LichessFetchImpl; now?: () => number }): void {
  client.configureFetch(opts);
}

/**
 * Test-only: resets all module-level state (queue, in-flight dedupe, cooldown, token provider,
 * fetch/clock overrides) between tests. Also re-reads any persisted retryAt from localStorage,
 * the same as a fresh module load would.
 */
export function _resetForTests(): void {
  client._resetForTests();
}

/** The shared clock (overridable via configureLichessFetch's `now`); cache.ts reuses it too. */
export function lichessNow(): number {
  return client.now();
}

/**
 * Hook for a future OAuth step: when the provider returns a token, lichessFetch adds
 * `Authorization: Bearer <token>` to requests targeting lichess.org or explorer.lichess.ovh
 * only. Pass `undefined` to clear it. Not wired to anything yet — this is just the seam.
 */
export function setLichessTokenProvider(fn: (() => string | undefined) | undefined): void {
  client.setTokenProvider(fn);
}

/** Number of lichess requests currently queued or in flight app-wide. */
export function lichessQueueLength(): number {
  return client.queueLength();
}

/**
 * The single entry point for every lichess.org / explorer.lichess.ovh request in the app: at
 * most one request in flight at a time (others wait their FIFO turn), an app-wide cooldown
 * after a 429 (lichess's own policy — see header comment), and same-URL GET dedupe. Non-429
 * responses are returned as-is; callers keep their own 404/empty-body handling.
 */
export async function lichessFetch(url: string, init?: RequestInit): Promise<Response> {
  return client.fetch(url, init);
}
