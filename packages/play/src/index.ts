// Opponents built on the engine package. Today: maximal resistance (full strength). Later:
// rating-calibrated play (UCI_Elo / Skill Level / Maia) with played-out calibration, which
// the Chessitout variant, the N-move opening game, group chess and the bot-rating test need.
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
