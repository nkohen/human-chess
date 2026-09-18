import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TRAINER_MODE, loadTrainerMode, saveTrainerMode } from './mode';

const KEY = 'human-chess.visualization-trainer.mode';

// Same in-memory Storage shim as subprojects/chessitout/src/positionSource.test.ts: the test
// environment has no global localStorage, which is exactly the "storage missing" case mode.ts
// is guarded against.
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

describe('loadTrainerMode', () => {
  it('defaults to lines when nothing is stored', () => {
    expect(loadTrainerMode()).toBe('lines');
    expect(DEFAULT_TRAINER_MODE).toBe('lines');
  });

  it('defaults when storage itself is unavailable (no throw)', () => {
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.localStorage;
    expect(loadTrainerMode()).toBe('lines');
  });

  it('round-trips memorize', () => {
    saveTrainerMode('memorize');
    expect(loadTrainerMode()).toBe('memorize');
  });

  it('round-trips lines after memorize', () => {
    saveTrainerMode('memorize');
    saveTrainerMode('lines');
    expect(loadTrainerMode()).toBe('lines');
  });

  it('falls back to the default for a garbage stored value', () => {
    globalThis.localStorage.setItem(KEY, 'nonsense');
    expect(loadTrainerMode()).toBe('lines');
  });
});

describe('saveTrainerMode', () => {
  it('does not throw when storage is unavailable', () => {
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.localStorage;
    expect(() => saveTrainerMode('memorize')).not.toThrow();
  });
});
