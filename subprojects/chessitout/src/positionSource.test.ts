import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_POSITION_SOURCE, loadPositionSource, savePositionSource } from './positionSource';

const KEY = 'human-chess.chessitout.position-source';

// The test environment (plain Node, no jsdom) has no global localStorage, which is exactly the
// "storage missing" case positionSource.ts is guarded against — so tests that need storage to
// actually persist install a minimal in-memory Storage first, same pattern as
// subprojects/openings-builder/src/storage.test.ts / bot-rating-test/src/records.test.ts.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

describe('loadPositionSource', () => {
  it('defaults to mined when nothing is stored', () => {
    expect(loadPositionSource()).toBe('mined');
    expect(DEFAULT_POSITION_SOURCE).toBe('mined');
  });

  it('defaults when storage itself is unavailable (no throw)', () => {
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.localStorage;
    expect(loadPositionSource()).toBe('mined');
  });

  it('round-trips curated', () => {
    savePositionSource('curated');
    expect(loadPositionSource()).toBe('curated');
  });

  it('round-trips mined after curated', () => {
    savePositionSource('curated');
    savePositionSource('mined');
    expect(loadPositionSource()).toBe('mined');
  });

  it('falls back to the default for a garbage stored value', () => {
    globalThis.localStorage.setItem(KEY, 'nonsense');
    expect(loadPositionSource()).toBe('mined');
  });
});

describe('savePositionSource', () => {
  it('does not throw when storage is unavailable', () => {
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.localStorage;
    expect(() => savePositionSource('curated')).not.toThrow();
  });
});
