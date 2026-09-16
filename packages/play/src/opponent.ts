// Opponents built on the engine package. Today: maximal resistance (full strength) and
// rating-limited play. Later: further calibration (Maia, played-out ratings) for the
// Chessitout variant, the N-move opening game, group chess and the bot-rating test.
import type { Analysis, UciEngine } from '@human-chess/engine';

export interface Opponent {
  id: string;
  /** Shown to users; says what the opponent does, not how strong it "feels". */
  description: string;
  chooseMove(engine: UciEngine, fen: string, moves: string[]): Promise<{ move: string; analysis: Analysis }>;
}

/**
 * Full-strength play with a short fixed think time. For the losing side this is the most
 * resistant defence Stockfish can find: its mate scores prefer the longest mate when losing.
 */
export function maximalResistance(movetimeMs = 600): Opponent {
  return {
    id: 'maximal-resistance',
    description: `full-strength engine, ${movetimeMs} ms per move`,
    chooseMove: (engine, fen, moves) => engine.bestMove(fen, moves, { movetime: movetimeMs }),
  };
}

/** Stockfish 19's own UCI_Elo range. */
export const MIN_UCI_ELO = 1320;
export const MAX_UCI_ELO = 3190;

/**
 * Rating-limited play via Stockfish's own UCI_LimitStrength/UCI_Elo. UciEngine restores these
 * options to their engine-reported defaults after the search (see packages/engine's
 * UciEngine.analyse/bestMove `options` parameter), so using this opponent never leaves a
 * shared engine weakened for whatever uses it next (A1).
 */
export function limitedStrength(elo: number, movetimeMs = 400): Opponent {
  const clampedElo = Math.min(MAX_UCI_ELO, Math.max(MIN_UCI_ELO, elo));
  return {
    id: `limited-strength-${clampedElo}`,
    description: `Stockfish with UCI_LimitStrength, UCI_Elo ${clampedElo}, ${movetimeMs} ms per move`,
    chooseMove: (engine, fen, moves) =>
      engine.bestMove(fen, moves, { movetime: movetimeMs }, { UCI_LimitStrength: true, UCI_Elo: clampedElo }),
  };
}
