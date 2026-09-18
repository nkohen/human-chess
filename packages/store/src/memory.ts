// In-memory GamesStore: the fallback openGamesStore() returns when `indexedDB` doesn't exist
// (very old/locked-down browsers, private-browsing modes that disable it, and this package's own
// tests where a fake-indexeddb path isn't in play), and also usable directly in a test that
// wants a fast, always-available store without fake-indexeddb.
import type { GameSource, GamesStore, StoredGame, SyncState } from './types';

/** `${site}:${lowercased username}` — the case-insensitivity point from GameSource's comment,
 * applied once here rather than at every call site. */
function sourceKey(source: GameSource): string {
  return `${source.site}:${source.username.toLowerCase()}`;
}

export function createMemoryGamesStore<G extends StoredGame = StoredGame>(): GamesStore<G> {
  const games = new Map<string, Map<string, G>>();
  const sync = new Map<string, SyncState>();
  // The exact GameSource (display-form username) last seen for each key, so listSources() can
  // hand back "NadavK" rather than the lowercased key it's stored under.
  const sources = new Map<string, GameSource>();

  function remember(source: GameSource): string {
    const key = sourceKey(source);
    sources.set(key, { site: source.site, username: source.username });
    return key;
  }

  return {
    async putGames(source, newGames) {
      // An empty batch never creates bookkeeping for `source` on its own (matches the IndexedDB
      // implementation, which only ever writes a record when there's a game to write) — a source
      // only becomes known via a non-empty putGames or a setSyncState call.
      if (newGames.length === 0) return 0;
      const key = remember(source);
      let bucket = games.get(key);
      if (!bucket) {
        bucket = new Map();
        games.set(key, bucket);
      }
      let added = 0;
      for (const game of newGames) {
        if (bucket.has(game.id)) continue;
        bucket.set(game.id, game);
        added += 1;
      }
      return added;
    },

    async listGames(source) {
      // structuredClone'd so a caller mutating the returned array's elements can't corrupt what's
      // stored — matches what IndexedDB gives you for free via its own structured-clone
      // serialization on every read.
      return [...(games.get(sourceKey(source))?.values() ?? [])].map(g => structuredClone(g));
    },

    async countGames(source) {
      return games.get(sourceKey(source))?.size ?? 0;
    },

    async newestPlayedAt(source) {
      const bucket = games.get(sourceKey(source));
      if (!bucket) return undefined;
      let newest: string | undefined;
      for (const game of bucket.values()) {
        if (game.playedAt !== undefined && (newest === undefined || game.playedAt > newest)) {
          newest = game.playedAt;
        }
      }
      return newest;
    },

    async getSyncState(source) {
      return sync.get(sourceKey(source));
    },

    async setSyncState(source, state) {
      const key = remember(source);
      sync.set(key, state);
    },

    async clearSource(source) {
      const key = sourceKey(source);
      games.delete(key);
      sync.delete(key);
      sources.delete(key);
    },

    async listSources() {
      return [...sources.values()];
    },
  };
}
