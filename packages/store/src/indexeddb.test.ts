// Runs the same GamesStore contract against the IndexedDB implementation, backed by
// fake-indexeddb (Apache-2.0; see memory/reuse-library.md) instead of a real browser. A fresh
// `IDBFactory` is installed on globalThis before each test (rather than reusing the package's
// shared `indexedDB` singleton and deleting the database between tests) so tests get real
// per-instance isolation with no teardown step to forget.
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import { defineGamesStoreTests } from './gamesStore.contract';
import { createIndexedDbGamesStore } from './indexeddb';
import type { GamesStore } from './types';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
});

defineGamesStoreTests('indexeddb (fake-indexeddb)', () => createIndexedDbGamesStore());

describe('createIndexedDbGamesStore failure surfacing', () => {
  it('rejects instead of hanging when indexedDB.open throws synchronously', async () => {
    // A locked-down/private-browsing indexedDB can throw synchronously from open() itself
    // (rather than firing onerror) — openDb() catches that; confirm the store surfaces it as a
    // rejected promise, not a hang.
    globalThis.indexedDB = {
      open: () => {
        throw new DOMException('indexedDB disabled', 'SecurityError');
      },
    } as unknown as IDBFactory;
    const store: GamesStore = createIndexedDbGamesStore();
    await expect(store.listGames({ site: 'lichess', username: 'nadavk' })).rejects.toThrow(/failed to open IndexedDB/);
  });

  it('rejects when the open request itself errors', async () => {
    const fakeRequest = {
      set onupgradeneeded(_v: unknown) {
        // never invoked
      },
      set onsuccess(_v: unknown) {
        // never invoked
      },
      set onerror(handler: (() => void) | null) {
        this.error = new DOMException('denied', 'NotAllowedError');
        queueMicrotask(() => handler?.());
      },
      set onblocked(_v: unknown) {
        // never invoked
      },
      error: null as unknown,
    };
    globalThis.indexedDB = {
      open: () => fakeRequest,
    } as unknown as IDBFactory;
    const store: GamesStore = createIndexedDbGamesStore();
    await expect(store.listGames({ site: 'lichess', username: 'nadavk' })).rejects.toThrow(/failed to open IndexedDB/);
  });
});
