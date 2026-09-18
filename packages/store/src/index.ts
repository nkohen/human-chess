// Persistence for the user's own data in the browser: games fetched from lichess and chess.com
// per linked account. openGamesStore() returns the IndexedDB implementation (database
// "human-chess") when `indexedDB` exists, else an in-memory fallback — the same GamesStore
// interface either way, so a caller (packages/import's syncSourceGames, and eventually the
// openings builder) never has to know which one it got. Built 2026-09-17.
//
// This package has no dependency on @human-chess/import (fixed 2026-09-17 — see types.ts's
// header comment): the id/hash helpers (`fnv1aHash`/`gameId`/`toStoredGame`) that used to live
// here moved to packages/import/src/hash.ts, since they need `ImportedGame`. `GamesStore` is
// generic over the stored-game shape instead (`G extends StoredGame`); packages/import passes
// `GamesStore<StoredImportedGame>` around.
export type { GameSource, GamesStore, StoredGame, SyncState } from './types';
export { createMemoryGamesStore } from './memory';

import { createIndexedDbGamesStore } from './indexeddb';
import { createMemoryGamesStore } from './memory';
import type { GamesStore, StoredGame } from './types';

/** The IndexedDB-backed store when the browser has `indexedDB` (every real browser; not Node,
 * unless a test polyfills it with fake-indexeddb — see indexeddb.test.ts), else
 * `createMemoryGamesStore()`. The memory fallback does not persist across a reload; callers that
 * care can check `typeof indexedDB === 'undefined'` themselves if they want to warn about that. */
export function openGamesStore<G extends StoredGame = StoredGame>(): GamesStore<G> {
  if (typeof indexedDB !== 'undefined') {
    return createIndexedDbGamesStore<G>();
  }
  return createMemoryGamesStore<G>();
}
