// One reconstruction attempt: pure state, no React, no engine. The learner enters BOTH
// sides' moves from the game's start position; legality comes entirely from
// @human-chess/rules — this module never judges a move against the real game (that is
// compare.ts, after the fact).
import {
  fenOf, legalDests, playMove, positionFromFen, turn, uciSquares,
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

/** Plays a move for whichever colour is currently to move. `promotion` is the piece the board's
 * picker returned, if this move was a pawn reaching the last rank. */
export function playReconstructionMove(r: Reconstruction, from: SquareName, to: SquareName, promotion?: Role): Reconstruction {
  const played = playMove(r.pos, from, to, promotion);
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
