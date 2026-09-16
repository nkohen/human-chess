// Next-level suggestion: a pure clamp/step function, no engine calls, no storage access.
// Never a rating estimate (V2/A1) — it only proposes what Elo to try next; the UI must label
// it "Suggested next level" and nothing stronger.
import { MAX_UCI_ELO, MIN_UCI_ELO } from '@human-chess/play';
import type { BotRatingRecord, GameOutcome } from './records';

/** Stockfish's own UCI_Elo range (see packages/play/src/opponent.ts). */
export const MIN_ELO = MIN_UCI_ELO;
export const MAX_ELO = MAX_UCI_ELO;
const STEP = 100;

/**
 * Elo levels offered in the UI: MIN_ELO stepping by 100, always ending exactly at MAX_ELO so
 * the true ceiling is reachable, even though the last step is shorter than 100.
 */
export const ELO_LEVELS: readonly number[] = (() => {
  const levels: number[] = [];
  for (let e = MIN_ELO; e < MAX_ELO; e += STEP) levels.push(e);
  levels.push(MAX_ELO);
  return levels;
})();

export function clampElo(elo: number): number {
  return Math.min(MAX_ELO, Math.max(MIN_ELO, elo));
}

/**
 * Index into ELO_LEVELS for `elo`. `elo` is normally one of ELO_LEVELS' own values (the UI only
 * ever hands back a value it offered), but for any other input this finds the closest level
 * rather than throwing.
 */
function levelIndex(elo: number): number {
  const exact = ELO_LEVELS.indexOf(elo);
  if (exact !== -1) return exact;
  let closest = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < ELO_LEVELS.length; i++) {
    const diff = Math.abs(ELO_LEVELS[i]! - elo);
    if (diff < bestDiff) {
      bestDiff = diff;
      closest = i;
    }
  }
  return closest;
}

/**
 * After a win, the next level up; after a loss, the next level down; after a draw, the same
 * level. Steps through ELO_LEVELS' own indices rather than by a flat ±100 offset, so the result
 * is always one of ELO_LEVELS' values and so always selectable in the UI — ELO_LEVELS' final
 * step (down to MAX_ELO) is shorter than 100, so a flat ±100 offset from MAX_ELO would land on a
 * value ELO_LEVELS does not contain.
 */
export function suggestNextElo(elo: number, result: GameOutcome): number {
  const i = levelIndex(elo);
  if (result === 'won') return ELO_LEVELS[Math.min(ELO_LEVELS.length - 1, i + 1)]!;
  if (result === 'lost') return ELO_LEVELS[Math.max(0, i - 1)]!;
  return ELO_LEVELS[i]!;
}

/**
 * Default Elo for a fresh setup screen: MIN_ELO with no history, otherwise the suggestion
 * that follows the most recently played record.
 */
export function suggestedStartingElo(records: BotRatingRecord[]): number {
  if (records.length === 0) return MIN_ELO;
  const latest = records.reduce((a, b) => (b.playedAt > a.playedAt ? b : a));
  return suggestNextElo(latest.elo, latest.result);
}
