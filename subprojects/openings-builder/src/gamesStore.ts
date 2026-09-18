// One lazily-created @human-chess/store handle for the "Your games" analysis, shared by
// SourcesPanel (sync/add/remove) and GamesTreeView (listing games to fold). Lazy rather than a
// module-level `openGamesStore()` call at import time so importing this file has no side effect
// until the "Your games" mode is actually rendered, and so a test that imports treeHelpers.ts (or
// anything else in this directory) never touches indexedDB.
import { openGamesStore } from '@human-chess/store';
import type { StoredImportedGame } from '@human-chess/import';
import type { GamesStore } from '@human-chess/store';

let store: GamesStore<StoredImportedGame> | undefined;

export function getGamesStore(): GamesStore<StoredImportedGame> {
  if (!store) store = openGamesStore<StoredImportedGame>();
  return store;
}
