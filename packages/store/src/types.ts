// Persistence for the user's own data: games fetched from lichess and chess.com, per linked
// account. See index.ts's header comment for the storage strategy (IndexedDB, memory fallback).
//
// This package has no dependency on @human-chess/import (fixed 2026-09-17, code review: the
// reverse used to be true too — packages/import's sync.ts needs GamesStore/GameSource from here,
// so a store->import dependency made the pnpm workspace graph a real cycle, not just a type-only
// one). `GamesStore` is generic over the stored game shape instead: this package only ever reads
// `id` (its dedupe key) and `playedAt` (for `newestPlayedAt`), so `StoredGame` below is the
// minimal shape it needs, not `ImportedGame`. packages/import defines its own richer
// `StoredImportedGame = ImportedGame & { id: string }` and passes `GamesStore<StoredImportedGame>`
// around — see packages/import/src/hash.ts.

/** One linked account on one site. Usernames are compared case-insensitively everywhere in this
 * package (lichess and chess.com usernames both are) — every storage key built from a
 * GameSource lowercases `username` first, but the *display* form (whatever casing the caller
 * passed) is preserved in `SyncState.username` and in what `listSources` hands back, so a caller
 * can still show "NadavK" instead of "nadavk". */
export interface GameSource {
  site: 'lichess' | 'chess.com';
  username: string;
}

/**
 * The minimal shape this store needs from a persisted game: a stable `id` (the dedupe key
 * `putGames` checks) and an optional `playedAt` (an ISO-8601 instant, read by `newestPlayedAt`).
 * Deliberately has no index signature and no other required fields, so a caller's own richer game
 * type (e.g. packages/import's `StoredImportedGame`) is assignable to it without this package
 * needing to know that type's shape.
 */
export interface StoredGame {
  id: string;
  // `| undefined` spelled explicitly (not just `?`), matching this codebase's
  // exactOptionalPropertyTypes idiom: packages/import's `ImportedGame.playedAt` is a required key
  // whose value is `string | undefined`, and `StoredImportedGame = ImportedGame & StoredGame`
  // needs this property's value type to line up exactly for that intersection to type-check.
  playedAt?: string | undefined;
}

/**
 * Where a sync last left off for one account, so the next sync can resume instead of re-fetching
 * everything. This package treats every field here as an opaque bag it stores and returns
 * as-is — the meaning of each is packages/import's business (see its `syncSourceGames`):
 * `lichess.sinceMs` is the forward cursor (one past the newest game's `playedAt` seen so far);
 * `lichess.oldestMs`/`lichess.historyComplete` track a backward backfill pass (lichess's `since`/
 * `until` filter by a game's *creation* time, not when it finished, so a plain forward cursor can
 * permanently miss a slow-finishing game or leave an account's pre-existing history unreachable —
 * see sync.ts); `chesscom.completedMonths` is which monthly archives have been fully pulled
 * (chess.com has no time cursor, only whole months, and the newest month is deliberately never
 * marked complete since more games can still land in it).
 */
export interface SyncState {
  /** Display-form username (see GameSource's comment) — not necessarily lowercased. */
  username: string;
  /** ISO-8601 UTC instant of the last successful sync. */
  lastSyncAt: string;
  lichess?: { sinceMs: number; oldestMs?: number; historyComplete?: boolean };
  chesscom?: { completedMonths: string[] };
}

/**
 * Games + sync bookkeeping for every linked account, one store per browser (see index.ts for
 * which implementation `openGamesStore()` picks). Every method is keyed by `GameSource`, whose
 * `username` is matched case-insensitively (see that interface's comment). `G` is the caller's
 * own stored-game shape (must at least satisfy `StoredGame`); defaults to the bare minimum shape
 * for callers that don't need anything richer.
 */
export interface GamesStore<G extends StoredGame = StoredGame> {
  /** Inserts every game in `games` whose `id` isn't already stored for `source` (idempotent: a
   * game already on record is left untouched, never overwritten — the point of `id` is exactly
   * that re-fetching the same game is a no-op). Returns how many were newly added, so a caller
   * can report "N new games" without re-deriving it from a before/after count itself. An empty
   * `games` array is a pure no-op: it never creates bookkeeping for `source` on its own (a
   * source only becomes known via a non-empty `putGames` or a `setSyncState` call). */
  putGames(source: GameSource, games: G[]): Promise<number>;
  /** Every stored game for `source`, in no particular order (callers that need an order — e.g.
   * newest-first — sort by `playedAt` themselves). Each call returns independent copies (never a
   * reference a caller could mutate to corrupt what's stored), matching what an IndexedDB
   * implementation gives you for free via structured cloning. */
  listGames(source: GameSource): Promise<G[]>;
  countGames(source: GameSource): Promise<number>;
  /** The latest `playedAt` among `source`'s stored games, or undefined when there are none or
   * none carry a `playedAt` — never a fabricated or clamped value. */
  newestPlayedAt(source: GameSource): Promise<string | undefined>;
  getSyncState(source: GameSource): Promise<SyncState | undefined>;
  setSyncState(source: GameSource, state: SyncState): Promise<void>;
  /** Removes every game and the sync state for `source`. */
  clearSource(source: GameSource): Promise<void>;
  /** Every source that has ever had `putGames` (with at least one game) or `setSyncState` called
   * for it (and not since `clearSource`d), each with its display-form username. */
  listSources(): Promise<GameSource[]>;
}
