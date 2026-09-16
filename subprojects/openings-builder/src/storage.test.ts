import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DEPTH,
  DEFAULT_EXPLORER_MAX,
  DEFAULT_EXPLORER_MIN,
  loadDepth,
  loadExplorerBand,
  MAX_DEPTH,
  MIN_DEPTH,
  saveDepth,
  saveExplorerBand,
} from './storage';

const DEPTH_KEY = 'human-chess.openings.depth.v1';
const EXPLORER_BAND_KEY = 'human-chess.openings.explorerBand.v1';

// The test environment (plain Node, no jsdom) has no global localStorage, which is exactly
// the "storage missing" case storage.ts is guarded against — so tests that need storage to
// actually persist install a minimal in-memory Storage first, same pattern as
// bot-rating-test/src/records.test.ts.
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

describe('loadDepth', () => {
  it('defaults to 20 when nothing is stored', () => {
    expect(loadDepth()).toBe(DEFAULT_DEPTH);
  });

  it('defaults when storage itself is unavailable (no throw)', () => {
    // @ts-expect-error simulating a non-browser environment, same as production without a DOM
    delete globalThis.localStorage;
    expect(loadDepth()).toBe(DEFAULT_DEPTH);
  });

  it('round-trips what saveDepth wrote', () => {
    saveDepth(24);
    expect(loadDepth()).toBe(24);
  });

  it('tolerates storage holding non-numeric garbage', () => {
    globalThis.localStorage.setItem(DEPTH_KEY, 'not a number');
    expect(loadDepth()).toBe(DEFAULT_DEPTH);
  });

  it('clamps a stored value above the max', () => {
    globalThis.localStorage.setItem(DEPTH_KEY, '999');
    expect(loadDepth()).toBe(MAX_DEPTH);
  });

  it('clamps a stored value below the min', () => {
    globalThis.localStorage.setItem(DEPTH_KEY, '0');
    expect(loadDepth()).toBe(MIN_DEPTH);
  });
});

describe('saveDepth', () => {
  it('clamps before persisting', () => {
    saveDepth(1000);
    expect(globalThis.localStorage.getItem(DEPTH_KEY)).toBe(String(MAX_DEPTH));
    saveDepth(-5);
    expect(globalThis.localStorage.getItem(DEPTH_KEY)).toBe(String(MIN_DEPTH));
  });

  it('does not throw when storage is unavailable', () => {
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.localStorage;
    expect(() => saveDepth(20)).not.toThrow();
  });
});

describe('loadExplorerBand', () => {
  it('defaults to 1600-2000 when nothing is stored', () => {
    expect(loadExplorerBand()).toEqual({ min: DEFAULT_EXPLORER_MIN, max: DEFAULT_EXPLORER_MAX });
  });

  it('defaults when storage itself is unavailable (no throw)', () => {
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.localStorage;
    expect(loadExplorerBand()).toEqual({ min: DEFAULT_EXPLORER_MIN, max: DEFAULT_EXPLORER_MAX });
  });

  it('round-trips what saveExplorerBand wrote', () => {
    saveExplorerBand({ min: 1000, max: 1400 });
    expect(loadExplorerBand()).toEqual({ min: 1000, max: 1400 });
  });

  it('falls back to the default when the stored min is not a documented bucket', () => {
    globalThis.localStorage.setItem(EXPLORER_BAND_KEY, JSON.stringify({ min: 1550, max: 2000 }));
    expect(loadExplorerBand()).toEqual({ min: DEFAULT_EXPLORER_MIN, max: DEFAULT_EXPLORER_MAX });
  });

  it('falls back to the default when min is greater than max', () => {
    globalThis.localStorage.setItem(EXPLORER_BAND_KEY, JSON.stringify({ min: 2000, max: 1600 }));
    expect(loadExplorerBand()).toEqual({ min: DEFAULT_EXPLORER_MIN, max: DEFAULT_EXPLORER_MAX });
  });

  it('tolerates storage holding garbage', () => {
    globalThis.localStorage.setItem(EXPLORER_BAND_KEY, 'not json');
    expect(loadExplorerBand()).toEqual({ min: DEFAULT_EXPLORER_MIN, max: DEFAULT_EXPLORER_MAX });
  });
});

describe('saveExplorerBand', () => {
  it('does not throw when storage is unavailable', () => {
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.localStorage;
    expect(() => saveExplorerBand({ min: 1600, max: 2000 })).not.toThrow();
  });
});
