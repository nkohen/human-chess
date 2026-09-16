import { beforeEach, describe, expect, it } from 'vitest';
import { appendRecord, clearRecords, loadRecords, saveRecords, type BotRatingRecord } from './records';

const KEY = 'human-chess.bot-rating-test.v1';

// The test environment (plain Node, no jsdom) has no global localStorage, which is exactly
// the "storage missing" case records.ts is guarded against — so tests that need storage to
// actually persist install a minimal in-memory Storage first.
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

const INPUT = {
  opponentId: 'limited-strength-1800',
  elo: 1800,
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  playerColor: 'white' as const,
  result: 'won' as const,
  moves: ['e2e4', 'e7e5'],
};

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
});

describe('loadRecords', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(loadRecords()).toEqual([]);
  });

  it('returns an empty array when storage itself is unavailable (no throw)', () => {
    // @ts-expect-error simulating a non-browser environment, same as production without a DOM
    delete globalThis.localStorage;
    expect(loadRecords()).toEqual([]);
  });

  it('round-trips what saveRecords wrote', () => {
    const record: BotRatingRecord = { id: 'a', playedAt: '2026-01-01T00:00:00.000Z', source: 'bot-rating-test', ...INPUT };
    saveRecords([record]);
    expect(loadRecords()).toEqual([record]);
  });

  it('tolerates storage holding non-JSON garbage', () => {
    globalThis.localStorage.setItem(KEY, 'not json{{{');
    expect(loadRecords()).toEqual([]);
  });

  it('tolerates storage holding a JSON value that is not an array', () => {
    globalThis.localStorage.setItem(KEY, JSON.stringify({ oops: true }));
    expect(loadRecords()).toEqual([]);
  });

  it('drops corrupt entries without losing the well-formed rest', () => {
    const good: BotRatingRecord = { id: 'good', playedAt: '2026-01-01T00:00:00.000Z', source: 'bot-rating-test', ...INPUT };
    const badEntries: unknown[] = [{ id: 'missing-fields' }, { ...good, result: 'sideways' }, { ...good, moves: 'e2e4' }, 42, null];
    globalThis.localStorage.setItem(KEY, JSON.stringify([good, ...badEntries]));
    expect(loadRecords()).toEqual([good]);
  });
});

describe('appendRecord', () => {
  it('builds a record with provenance and persists it', () => {
    const records = appendRecord(INPUT, { id: 'fixed-id', now: () => '2026-02-02T12:00:00.000Z' });
    expect(records).toEqual([{ id: 'fixed-id', playedAt: '2026-02-02T12:00:00.000Z', source: 'bot-rating-test', ...INPUT }]);
    expect(loadRecords()).toEqual(records);
  });

  it('appends onto existing records rather than replacing them', () => {
    appendRecord(INPUT, { id: 'first', now: () => '2026-01-01T00:00:00.000Z' });
    const records = appendRecord({ ...INPUT, elo: 1900, result: 'lost' }, { id: 'second', now: () => '2026-01-02T00:00:00.000Z' });
    expect(records.map(r => r.id)).toEqual(['first', 'second']);
  });
});

describe('clearRecords', () => {
  it('empties the stored records', () => {
    appendRecord(INPUT);
    expect(loadRecords()).toHaveLength(1);
    clearRecords();
    expect(loadRecords()).toEqual([]);
  });
});
