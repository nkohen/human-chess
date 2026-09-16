// Bot-rating-test game records: one entry per finished attempt, provenance-tagged, kept in
// localStorage, guarded because storage can be missing (no browser) or throw (private mode,
// quota). Pure aside from the storage calls themselves; every record is built only from a
// real, already-played game passed in by the caller — never edited or fabricated (A1).
import type { Color } from '@human-chess/rules';

export type GameOutcome = 'won' | 'lost' | 'draw';

export interface BotRatingRecord {
  id: string;
  /** ISO timestamp of when the game ended. */
  playedAt: string;
  /** The Opponent's id, e.g. `limited-strength-1800`. */
  opponentId: string;
  elo: number;
  startFen: string;
  playerColor: Color;
  result: GameOutcome;
  /** Moves actually played, in UCI, in play order. */
  moves: string[];
  source: 'bot-rating-test';
}

const KEY = 'human-chess.bot-rating-test.v1';

function isGameOutcome(x: unknown): x is GameOutcome {
  return x === 'won' || x === 'lost' || x === 'draw';
}

function isColor(x: unknown): x is Color {
  return x === 'white' || x === 'black';
}

function isRecord(x: unknown): x is BotRatingRecord {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r['id'] === 'string' &&
    typeof r['playedAt'] === 'string' &&
    typeof r['opponentId'] === 'string' &&
    typeof r['elo'] === 'number' &&
    typeof r['startFen'] === 'string' &&
    isColor(r['playerColor']) &&
    isGameOutcome(r['result']) &&
    Array.isArray(r['moves']) &&
    r['moves'].every(m => typeof m === 'string') &&
    r['source'] === 'bot-rating-test'
  );
}

/**
 * Loads records from storage, guarded. A missing key, unreadable storage, non-array JSON, or
 * an individual malformed entry never crashes the page and never invents a record — it is
 * simply dropped, so one corrupt entry doesn't sink the rest.
 */
export function loadRecords(): BotRatingRecord[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

export function saveRecords(records: BotRatingRecord[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(records));
  } catch {
    // storage unavailable: records live for this page only
  }
}

export interface NewRecordInput {
  opponentId: string;
  elo: number;
  startFen: string;
  playerColor: Color;
  result: GameOutcome;
  moves: string[];
}

/**
 * Appends one record — built only from real, already-played game state the caller passes in —
 * and persists the full list. Returns the updated list so the caller can render it without a
 * second read.
 */
export function appendRecord(input: NewRecordInput, opts: { id?: string; now?: () => string } = {}): BotRatingRecord[] {
  const id = opts.id ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const playedAt = opts.now ? opts.now() : new Date().toISOString();
  const record: BotRatingRecord = { id, playedAt, source: 'bot-rating-test', ...input };
  const records = [...loadRecords(), record];
  saveRecords(records);
  return records;
}

export function clearRecords(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}
