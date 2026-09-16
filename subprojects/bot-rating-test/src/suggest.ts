// Next-level suggestion: a pure clamp/step function, no engine calls, no storage access.
// Never a rating estimate (V2/A1) — it only proposes what Elo to try next; the UI must label
// it "Suggested next level" and nothing stronger.
import type { BotRatingRecord, GameOutcome } from './records';

/** Stockfish's own UCI_Elo range (see packages/play/src/opponent.ts). */
export const MIN_ELO = 1320;
export const MAX_ELO = 3190;
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

/** After a win, try one level up; after a loss, one level down; after a draw, the same level. */
export function suggestNextElo(elo: number, result: GameOutcome): number {
  if (result === 'won') return clampElo(elo + STEP);
  if (result === 'lost') return clampElo(elo - STEP);
  return clampElo(elo);
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
