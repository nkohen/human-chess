import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER1_NAME,
  DEFAULT_PLAYER2_NAME,
  loadPlayerNames,
  loadPveTimeLimit,
  loadPvpTimeLimit,
  savePlayerNames,
  savePveTimeLimit,
  savePvpTimeLimit,
} from './storage';
import { DEFAULT_PVE_TIME_LIMIT, DEFAULT_PVP_TIME_LIMIT } from './timing';

// No jsdom in this workspace's test environment, so localStorage is genuinely absent until a
// test installs one — the same "storage missing" case storage.ts guards against in production.
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

describe('PvE time limit', () => {
  it('defaults to none when nothing is stored', () => {
    expect(loadPveTimeLimit()).toBe(DEFAULT_PVE_TIME_LIMIT);
  });

  it('round-trips a stored choice', () => {
    savePveTimeLimit(30);
    expect(loadPveTimeLimit()).toBe(30);
  });

  it('falls back to the default for a value outside the documented choices', () => {
    globalThis.localStorage.setItem('human-chess.guessTheEval.pveTimeLimit.v1', '"45"');
    expect(loadPveTimeLimit()).toBe(DEFAULT_PVE_TIME_LIMIT);
  });

  it('defaults when storage itself is unavailable (no throw)', () => {
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.localStorage;
    expect(loadPveTimeLimit()).toBe(DEFAULT_PVE_TIME_LIMIT);
    expect(() => savePveTimeLimit(15)).not.toThrow();
  });
});

describe('PvP time limit', () => {
  it('defaults to 30s when nothing is stored', () => {
    expect(loadPvpTimeLimit()).toBe(DEFAULT_PVP_TIME_LIMIT);
  });

  it('round-trips a stored choice', () => {
    savePvpTimeLimit(60);
    expect(loadPvpTimeLimit()).toBe(60);
  });

  it('rejects "none" — PvP has no untimed choice', () => {
    globalThis.localStorage.setItem('human-chess.guessTheEval.pvpTimeLimit.v1', '"none"');
    expect(loadPvpTimeLimit()).toBe(DEFAULT_PVP_TIME_LIMIT);
  });
});

describe('player names', () => {
  it('defaults to Player 1 / Player 2', () => {
    expect(loadPlayerNames()).toEqual({ player1: DEFAULT_PLAYER1_NAME, player2: DEFAULT_PLAYER2_NAME });
  });

  it('round-trips edited names', () => {
    savePlayerNames({ player1: 'Nadav', player2: 'Alex' });
    expect(loadPlayerNames()).toEqual({ player1: 'Nadav', player2: 'Alex' });
  });

  it('falls back per-field on a blank name', () => {
    savePlayerNames({ player1: '', player2: 'Alex' });
    expect(loadPlayerNames()).toEqual({ player1: DEFAULT_PLAYER1_NAME, player2: 'Alex' });
  });

  it('tolerates storage holding garbage', () => {
    globalThis.localStorage.setItem('human-chess.guessTheEval.pvpPlayerNames.v1', 'not json');
    expect(loadPlayerNames()).toEqual({ player1: DEFAULT_PLAYER1_NAME, player2: DEFAULT_PLAYER2_NAME });
  });
});
