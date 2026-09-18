// Cross-tool hand-off: one subproject sends another a starting position (and a little context)
// by putting query params after the hash route, e.g. "#/bot-rating?fen=...&color=white". This
// is deliberately not a store or a message bus (memory/subprojects-overview.md's shared layer
// has neither yet) — it's just URL state, exactly like a normal web app's query string, except
// the route lives after "#" because apps/web is a client-only hash router (App.tsx's useHash).
// `handoffHash` is the pure part (safe to unit-test without a DOM); `navigateWithHandoff` is the
// one-line impure wrapper every "Play from this position" / "Review the source game" button
// calls. `routeOf`/`readHandoffParams` are the reader's half, used by App.tsx's routing and by
// each receiving screen on mount.

/** Builds a hash route with a query string attached: `handoffHash('#/bot-rating', { fen })` →
 * `'#/bot-rating?fen=...'`. Empty `params` returns `hash` unchanged (no bare trailing '?'), so
 * callers can pass `{}` uniformly instead of special-casing the param-less case. */
export function handoffHash(hash: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query === '' ? hash : `${hash}?${query}`;
}

/** Navigates the app to `hash` carrying `params` as a hand-off — the one impure line; every
 * caller elsewhere should be able to compute what it needs from `handoffHash` alone. */
export function navigateWithHandoff(hash: string, params: Record<string, string>): void {
  window.location.hash = handoffHash(hash, params);
}

/** The route part of a hash, before its query string (if any): `routeOf('#/bot-rating?fen=x')`
 * → `'#/bot-rating'`. App.tsx's `useHash` compares routes on this, not on the raw hash, so a
 * hand-off's query string never breaks which screen renders. */
export function routeOf(hash: string): string {
  const queryAt = hash.indexOf('?');
  return queryAt === -1 ? hash : hash.slice(0, queryAt);
}

/** Parses the query part of a hash route, e.g. `readHandoffParams('#/bot-rating?fen=x&color=y')`
 * → `URLSearchParams` with `fen`/`color`. No query part (or no `hash` at all) parses as empty,
 * never throws — a screen with no hand-off just sees an empty `URLSearchParams`. */
export function readHandoffParams(hash: string): URLSearchParams {
  const queryAt = hash.indexOf('?');
  return new URLSearchParams(queryAt === -1 ? '' : hash.slice(queryAt + 1));
}

/**
 * Reads a hand-off and takes it out of the address bar in the same step, so a page reload
 * does not replay it. A receiving screen calls this once, in a state initialiser: a fresh
 * hand-off (params present) wins over whatever the screen had persisted, and the URL is
 * rewritten to the bare route with `history.replaceState`, which fires no `hashchange`, so the
 * next reload restores the screen's own persisted state instead of re-applying the hand-off.
 * Without params it is `readHandoffParams` and touches nothing. Never throws.
 */
export function consumeHandoffParams(hash: string = window.location.hash): URLSearchParams {
  const params = readHandoffParams(hash);
  if (hash.includes('?')) {
    try {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${routeOf(hash)}`);
    } catch {
      // history unavailable: the hand-off simply stays in the URL
    }
  }
  return params;
}
