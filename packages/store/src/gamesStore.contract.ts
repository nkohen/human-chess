// Shared behavioural contract for GamesStore, run against both createMemoryGamesStore() and
// createIndexedDbGamesStore() (see memory.test.ts / indexeddb.test.ts) so the two implementations
// can never silently drift apart. Not itself a *.test.ts file — vitest would otherwise collect it
// with zero tests inside (no `it()` calls run until a caller invokes defineGamesStoreTests).
//
// Uses the bare minimum `StoredGame` shape (this package no longer knows about ImportedGame —
// see types.ts) plus one extra `tag` field, so the contract also exercises that a store round
// -trips a caller's own extra fields, not just `id`/`playedAt`.
import { describe, expect, it } from 'vitest';

import type { GameSource, GamesStore, StoredGame } from './types';

interface TestGame extends StoredGame {
  tag: string;
}

function game(overrides: Partial<TestGame> = {}): TestGame {
  return {
    id: 'https://lichess.org/abcd1234',
    playedAt: '2026-09-01T00:00:00.000Z',
    tag: 'a game',
    ...overrides,
  };
}

const LICHESS: GameSource = { site: 'lichess', username: 'NadavK' };
const CHESSCOM: GameSource = { site: 'chess.com', username: 'chicachoo123' };

/** Runs the full GamesStore contract against `createStore()` — a fresh store per test (each test
 * calls createStore() itself so state never leaks between cases, matching how a real caller gets
 * a fresh IndexedDB connection or memory store per page load / test). */
export function defineGamesStoreTests(name: string, createStore: () => GamesStore<TestGame>): void {
  describe(`GamesStore contract: ${name}`, () => {
    it('putGames adds new games and returns the added count', async () => {
      const store = createStore();
      const added = await store.putGames(LICHESS, [game({ id: 'a' }), game({ id: 'b' })]);
      expect(added).toBe(2);
      expect(await store.listGames(LICHESS)).toHaveLength(2);
    });

    it('putGames is idempotent: re-adding an already-stored id is a no-op', async () => {
      const store = createStore();
      await store.putGames(LICHESS, [game({ id: 'a' })]);
      const added = await store.putGames(LICHESS, [game({ id: 'a' }), game({ id: 'b' })]);
      expect(added).toBe(1);
      expect(await store.countGames(LICHESS)).toBe(2);
    });

    it('putGames with an empty array is a no-op and does not create bookkeeping for the source', async () => {
      const store = createStore();
      const added = await store.putGames(LICHESS, []);
      expect(added).toBe(0);
      expect(await store.listSources()).toEqual([]);
    });

    it('listGames returns independent copies a caller cannot use to corrupt the store', async () => {
      const store = createStore();
      await store.putGames(LICHESS, [game({ id: 'a', tag: 'original' })]);
      const [first] = await store.listGames(LICHESS);
      first!.tag = 'mutated';
      const [second] = await store.listGames(LICHESS);
      expect(second!.tag).toBe('original');
    });

    it('keeps sources separate', async () => {
      const store = createStore();
      await store.putGames(LICHESS, [game({ id: 'a' })]);
      await store.putGames(CHESSCOM, [game({ id: 'a' }), game({ id: 'b' })]);
      expect(await store.countGames(LICHESS)).toBe(1);
      expect(await store.countGames(CHESSCOM)).toBe(2);
    });

    it('countGames and listGames are 0/empty for a source never seen', async () => {
      const store = createStore();
      expect(await store.countGames(LICHESS)).toBe(0);
      expect(await store.listGames(LICHESS)).toEqual([]);
    });

    it('usernames match case-insensitively', async () => {
      const store = createStore();
      await store.putGames({ site: 'lichess', username: 'NadavK' }, [game({ id: 'a' })]);
      expect(await store.countGames({ site: 'lichess', username: 'nadavk' })).toBe(1);
      expect(await store.countGames({ site: 'lichess', username: 'NADAVK' })).toBe(1);
    });

    it('newestPlayedAt tracks the latest playedAt among stored games', async () => {
      const store = createStore();
      await store.putGames(LICHESS, [
        game({ id: 'a', playedAt: '2026-09-01T00:00:00.000Z' }),
        game({ id: 'b', playedAt: '2026-09-05T00:00:00.000Z' }),
        game({ id: 'c', playedAt: '2026-09-03T00:00:00.000Z' }),
      ]);
      expect(await store.newestPlayedAt(LICHESS)).toBe('2026-09-05T00:00:00.000Z');
    });

    it('newestPlayedAt is undefined when there are no games, or none carry a playedAt', async () => {
      const store = createStore();
      expect(await store.newestPlayedAt(LICHESS)).toBeUndefined();
      await store.putGames(LICHESS, [game({ id: 'a', playedAt: undefined })]);
      expect(await store.newestPlayedAt(LICHESS)).toBeUndefined();
    });

    it('getSyncState is undefined until setSyncState is called, then round-trips', async () => {
      const store = createStore();
      expect(await store.getSyncState(LICHESS)).toBeUndefined();
      const state = { username: 'NadavK', lastSyncAt: '2026-09-17T00:00:00.000Z', lichess: { sinceMs: 12345 } };
      await store.setSyncState(LICHESS, state);
      expect(await store.getSyncState(LICHESS)).toEqual(state);
    });

    it('setSyncState overwrites a previous state for the same source', async () => {
      const store = createStore();
      await store.setSyncState(LICHESS, { username: 'NadavK', lastSyncAt: '2026-09-17T00:00:00.000Z', lichess: { sinceMs: 1 } });
      await store.setSyncState(LICHESS, { username: 'NadavK', lastSyncAt: '2026-09-18T00:00:00.000Z', lichess: { sinceMs: 2 } });
      expect(await store.getSyncState(LICHESS)).toEqual({ username: 'NadavK', lastSyncAt: '2026-09-18T00:00:00.000Z', lichess: { sinceMs: 2 } });
    });

    it('clearSource removes both games and sync state, leaving other sources alone', async () => {
      const store = createStore();
      await store.putGames(LICHESS, [game({ id: 'a' })]);
      await store.putGames(CHESSCOM, [game({ id: 'a' })]);
      await store.setSyncState(LICHESS, { username: 'NadavK', lastSyncAt: '2026-09-17T00:00:00.000Z' });
      await store.clearSource(LICHESS);
      expect(await store.countGames(LICHESS)).toBe(0);
      expect(await store.getSyncState(LICHESS)).toBeUndefined();
      expect(await store.countGames(CHESSCOM)).toBe(1);
    });

    it('listSources reports every source seen via putGames or setSyncState, with display-form username', async () => {
      const store = createStore();
      await store.putGames(LICHESS, [game({ id: 'a' })]);
      await store.setSyncState(CHESSCOM, { username: 'chicachoo123', lastSyncAt: '2026-09-17T00:00:00.000Z' });
      const sources = await store.listSources();
      expect(sources).toHaveLength(2);
      expect(sources).toContainEqual({ site: 'lichess', username: 'NadavK' });
      expect(sources).toContainEqual({ site: 'chess.com', username: 'chicachoo123' });
    });

    it('listSources omits a source after clearSource', async () => {
      const store = createStore();
      await store.putGames(LICHESS, [game({ id: 'a' })]);
      await store.clearSource(LICHESS);
      expect(await store.listSources()).toEqual([]);
    });

    it('listSources is empty for a fresh store', async () => {
      const store = createStore();
      expect(await store.listSources()).toEqual([]);
    });
  });
}
