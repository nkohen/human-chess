// chess.com's Published-Data API (https://api.chess.com/pub/...) is read-only and needs no
// login or key. Verified 2026-09-17 from chess.com's docs and a single live request: responses
// carry `access-control-allow-origin: *`, so browser calls work. chess.com asks API clients to
// put contact info in their User-Agent, but browsers cannot set that header at all — this app
// is a static site with no server leg to attach one from, so that part of the policy is simply
// not followable here. Documented policy: one request at a time; parallel requests get 429, no
// stated cooldown length (Retry-After when present, else 60 s, capped at 10 minutes — same
// policy lichess.org uses). This module is chess.com's instance of the generic client in
// @human-chess/site-client (see packages/lichess/src/fetch.ts, the first instance of that
// factory, for the fuller design note).
import { createSiteClient, type SiteFetchImpl } from '@human-chess/site-client';

const client = createSiteClient({
  name: 'chess.com',
  errorClassName: 'ChesscomRateLimited',
  storagePrefix: 'human-chess.chesscom',
  // No login exists for this API, so no host needs an Authorization header.
});

/** Thrown instead of sending a request while chess.com's cooldown is in effect, and for a 429. */
export const ChesscomRateLimited = client.RateLimited;

/** Internal seam: cache.ts shares this exact client (queue, cooldown) rather than constructing
 * its own, so caching sits on top of the one queue instead of a second one. */
export const _chesscomClient = client;

export type ChesscomFetchImpl = SiteFetchImpl;

/** Test-only: override the underlying fetch implementation and/or clock. Production code never
 * calls this. */
export function configureChesscomFetch(opts: { fetchImpl?: ChesscomFetchImpl; now?: () => number }): void {
  client.configureFetch(opts);
}

/** Test-only: resets all module-level state between tests, and re-reads any persisted retryAt
 * from localStorage, the same as a fresh module load would. */
export function _resetForTests(): void {
  client._resetForTests();
}

/** The shared clock (overridable via configureChesscomFetch's `now`); cache.ts reuses it too. */
export function chesscomNow(): number {
  return client.now();
}

/** Number of chess.com requests currently queued or in flight app-wide. */
export function chesscomQueueLength(): number {
  return client.queueLength();
}

/**
 * The single entry point for every api.chess.com request in the app: at most one request in
 * flight at a time (others wait their FIFO turn), an app-wide cooldown after a 429, and
 * same-URL GET dedupe. Non-429 responses are returned as-is; callers keep their own
 * 404/empty-body handling.
 */
export async function chesscomFetch(url: string, init?: RequestInit): Promise<Response> {
  return client.fetch(url, init);
}
