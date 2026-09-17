// One reconstruction attempt: pure state, no React, no engine. The learner enters BOTH
// sides' moves from the game's start position; legality comes entirely from
// @human-chess/rules — this module never judges a move against the real game (that is
// compare.ts, after the fact).
import {
  fenOf, isPromotionMove, legalDests, playMove, positionFromFen, turn, uciSquares,
  type Color, type Position, type Role, type SquareName,
} from '@human-chess/rules';

export interface ReconstructedMove {
  uci: string;
  san: string;
}

export interface Reconstruction {
  startFen: string;
  pos: Position;
  moves: ReconstructedMove[];
}

export function startReconstruction(startFen: string): Reconstruction {
  return { startFen, pos: positionFromFen(startFen), moves: [] };
}

/**
 * Plays a move for whichever colour is currently to move. Promotions always auto-queen —
 * there is no promotion picker in this slice, so a pawn reaching the last rank always
 * becomes a queen.
 */
export function playReconstructionMove(r: Reconstruction, from: SquareName, to: SquareName): Reconstruction {
  const promotion: Role | undefined = isPromotionMove(r.pos, from, to) ? 'queen' : undefined;
  const played = promotion ? playMove(r.pos, from, to, promotion) : playMove(r.pos, from, to);
  return { ...r, pos: played.pos, moves: [...r.moves, { uci: played.uci, san: played.san }] };
}

export const currentFen = (r: Reconstruction): string => fenOf(r.pos);
export const sideToMove = (r: Reconstruction): Color => turn(r.pos);
export const reconstructionDests = (r: Reconstruction): Map<SquareName, SquareName[]> => legalDests(r.pos);
export const reconstructedUcis = (r: Reconstruction): string[] => r.moves.map(m => m.uci);
export const reconstructedSans = (r: Reconstruction): string[] => r.moves.map(m => m.san);

export const lastReconstructedMove = (r: Reconstruction): [SquareName, SquareName] | undefined => {
  const m = r.moves[r.moves.length - 1];
  return m ? uciSquares(m.uci) : undefined;
};
