// IndexedDB GamesStore: database "human-chess", object store "games" (keyed by
// `${site}:${lowercased username}:${id}`, indexed on the source so a whole account's games can
// be listed/counted/cleared in one range query) and "sync" (keyed by `${site}:${lowercased
// username}`). Every failure (blocked open, quota, a version conflict) rejects the returned
// promise with a clear message instead of hanging — nothing here relies on an event that might
// never fire.
import type { GameSource, GamesStore, StoredGame, SyncState } from './types';

const DB_NAME = 'human-chess';
const DB_VERSION = 1;
const GAMES_STORE = 'games';
const SYNC_STORE = 'sync';
const SOURCE_INDEX = 'source';

function sourceKey(source: GameSource): string {
  return `${source.site}:${source.username.toLowerCase()}`;
}

function gameKey(source: GameSource, id: string): string {
  return `${sourceKey(source)}:${id}`;
}

/** What's actually stored for one game: the primary key, the flat `sourceKey` the SOURCE_INDEX
 * is built on (an index needs a flat, indexable field — it can't reach into `game`), the exact
 * GameSource as given (display-form username, for listSources()), and the game itself. Nested
 * rather than spread at the top level so nothing here can collide with one of StoredGame's own
 * field names (`ImportedGame.source` is itself `'lichess' | 'chess.com' | 'pgn'`, a different
 * thing from this record's `source: GameSource` — spreading would have clashed). */
interface GameRecord<G extends StoredGame> {
  _key: string;
  sourceKey: string;
  source: GameSource;
  game: G;
}

interface SyncRecord {
  _key: string;
  source: GameSource;
  state: SyncState;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(new Error(`failed to open IndexedDB "${DB_NAME}": ${err instanceof Error ? err.message : String(err)}`));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GAMES_STORE)) {
        const store = db.createObjectStore(GAMES_STORE, { keyPath: '_key' });
        store.createIndex(SOURCE_INDEX, 'sourceKey');
      }
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: '_key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error(`failed to open IndexedDB "${DB_NAME}": ${request.error?.message ?? 'unknown error'}`));
    // Fires when an older connection (another tab, or a stale one in this same page) is still
    // open at a lower version and blocks this upgrade — surfaced rather than left to hang
    // forever waiting for onsuccess/onerror, neither of which fires in this case.
    request.onblocked = () =>
      reject(new Error(`opening IndexedDB "${DB_NAME}" was blocked by another open connection`));
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Runs `run` against a transaction on `storeNames`, resolving with `run`'s own result once the
 * transaction completes, and rejecting — rather than hanging — on any of the ways a transaction
 * can fail: `run` itself throwing/rejecting (aborts the transaction), a request inside it
 * failing, or the transaction being aborted by the browser (e.g. a quota error IndexedDB raises
 * as an abort rather than a request error in some implementations). */
function runTransaction<T>(db: IDBDatabase, storeNames: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeNames, mode);
    } catch (err) {
      reject(new Error(`failed to start an IndexedDB transaction: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }
    let settled = false;
    let result: T;
    tx.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    tx.onerror = () => {
      if (!settled) {
        settled = true;
        reject(tx.error ?? new Error('IndexedDB transaction failed'));
      }
    };
    tx.onabort = () => {
      if (!settled) {
        settled = true;
        reject(tx.error ?? new Error('IndexedDB transaction aborted (quota exceeded?)'));
      }
    };
    run(tx).then(
      r => {
        result = r;
      },
      err => {
        if (!settled) {
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
        try {
          tx.abort();
        } catch {
          // Already finished (complete/abort already fired) — nothing to do.
        }
      },
    );
  });
}

export function createIndexedDbGamesStore<G extends StoredGame = StoredGame>(): GamesStore<G> {
  // Opened lazily (on the first call, not at createIndexedDbGamesStore()), and the *promise* is
  // cached (not the resolved db) so concurrent early calls share one open() rather than racing
  // several; a failed open is not cached, so the next call retries instead of failing forever.
  let dbPromise: Promise<IDBDatabase> | undefined;
  function getDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = openDb().then(db => {
        // Fires when another tab/connection upgrades the database's schema while this connection
        // is still open (IndexedDB requires every other open connection to close first — this is
        // that close). Also drops the cached promise so the next call reopens a fresh connection
        // at the new version instead of reusing this now-stale one.
        db.onversionchange = () => {
          db.close();
          dbPromise = undefined;
        };
        return db;
      });
      dbPromise = dbPromise.catch((err: unknown) => {
        dbPromise = undefined;
        throw err;
      });
    }
    return dbPromise;
  }

  // Named functions closing over getDb (not object-literal methods relying on `this`), so the
  // returned GamesStore stays correct even if a caller destructures one method off it.

  async function putGames(source: GameSource, newGames: G[]): Promise<number> {
    const db = await getDb();
    const sKey = sourceKey(source);
    return runTransaction(db, [GAMES_STORE], 'readwrite', async tx => {
      const store = tx.objectStore(GAMES_STORE);
      const index = store.index(SOURCE_INDEX);
      // Existing primary keys for this source, fetched once, so putting N games costs one range
      // read plus N puts rather than a get-then-put pair per game.
      const existingKeys = new Set((await promisify(index.getAllKeys(IDBKeyRange.only(sKey)))).map(String));
      let added = 0;
      for (const game of newGames) {
        const key = gameKey(source, game.id);
        if (existingKeys.has(key)) continue;
        const record: GameRecord<G> = { _key: key, sourceKey: sKey, source: { site: source.site, username: source.username }, game };
        store.put(record);
        existingKeys.add(key);
        added += 1;
      }
      return added;
    });
  }

  async function listGames(source: GameSource): Promise<G[]> {
    const db = await getDb();
    const sKey = sourceKey(source);
    return runTransaction(db, [GAMES_STORE], 'readonly', async tx => {
      const records = await promisify<GameRecord<G>[]>(tx.objectStore(GAMES_STORE).index(SOURCE_INDEX).getAll(IDBKeyRange.only(sKey)));
      // Already independent copies: IndexedDB serializes every record through structured clone on
      // both put and get, so `r.game` here can never be the same object a caller passed to
      // putGames — no extra structuredClone needed (contrast the in-memory store, which stores
      // the object itself and clones on the way out).
      return records.map(r => r.game);
    });
  }

  async function countGames(source: GameSource): Promise<number> {
    const db = await getDb();
    const sKey = sourceKey(source);
    return runTransaction(db, [GAMES_STORE], 'readonly', tx =>
      promisify(tx.objectStore(GAMES_STORE).index(SOURCE_INDEX).count(IDBKeyRange.only(sKey))),
    );
  }

  // Loads every one of `source`'s games (via listGames) to scan for the max `playedAt` — no
  // targeted/indexed query for this, since `playedAt` isn't itself indexed (only sourceKey is).
  // Fine at the scale this store is built for (one person's own game history); would want a
  // dedicated index if a source's game count grows large enough to make this scan matter.
  async function newestPlayedAt(source: GameSource): Promise<string | undefined> {
    const games = await listGames(source);
    let newest: string | undefined;
    for (const game of games) {
      if (game.playedAt !== undefined && (newest === undefined || game.playedAt > newest)) newest = game.playedAt;
    }
    return newest;
  }

  async function getSyncState(source: GameSource): Promise<SyncState | undefined> {
    const db = await getDb();
    const sKey = sourceKey(source);
    return runTransaction(db, [SYNC_STORE], 'readonly', async tx => {
      const record = await promisify<SyncRecord | undefined>(tx.objectStore(SYNC_STORE).get(sKey));
      return record?.state;
    });
  }

  async function setSyncState(source: GameSource, state: SyncState): Promise<void> {
    const db = await getDb();
    const sKey = sourceKey(source);
    await runTransaction(db, [SYNC_STORE], 'readwrite', async tx => {
      const record: SyncRecord = { _key: sKey, source: { site: source.site, username: source.username }, state };
      tx.objectStore(SYNC_STORE).put(record);
    });
  }

  async function clearSource(source: GameSource): Promise<void> {
    const db = await getDb();
    const sKey = sourceKey(source);
    await runTransaction(db, [GAMES_STORE, SYNC_STORE], 'readwrite', async tx => {
      const gamesStore = tx.objectStore(GAMES_STORE);
      const keys = await promisify(gamesStore.index(SOURCE_INDEX).getAllKeys(IDBKeyRange.only(sKey)));
      for (const key of keys) gamesStore.delete(key);
      tx.objectStore(SYNC_STORE).delete(sKey);
    });
  }

  async function listSources(): Promise<GameSource[]> {
    const db = await getDb();
    return runTransaction(db, [GAMES_STORE, SYNC_STORE], 'readonly', async tx => {
      const seen = new Map<string, GameSource>();
      const gameRecords = await promisify<GameRecord<G>[]>(tx.objectStore(GAMES_STORE).getAll());
      for (const r of gameRecords) if (!seen.has(r.sourceKey)) seen.set(r.sourceKey, r.source);
      const syncRecords = await promisify<SyncRecord[]>(tx.objectStore(SYNC_STORE).getAll());
      for (const r of syncRecords) if (!seen.has(r._key)) seen.set(r._key, r.source);
      return [...seen.values()];
    });
  }

  return { putGames, listGames, countGames, newestPlayedAt, getSyncState, setSyncState, clearSource, listSources };
}
