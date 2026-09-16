// Groups legal destinations by piece type: what "call a piece type before moving" needs
// (Hand and Brain and anything similar). Built entirely from legalDests plus the board's own
// piece at each origin square; no move generation or legality logic lives here.
import type { Role, SquareName } from 'chessops/types';
import { legalDests, pieceAt, type Position } from './index';

/** The role of the piece on `square`, or undefined if the square is empty. Built on the one board read in `pieceAt`. */
export function roleAt(pos: Position, square: SquareName): Role | undefined {
  return pieceAt(pos, square)?.role;
}

/** Legal destinations per origin square, grouped by the role of the piece being moved. */
export function legalDestsByRole(pos: Position): Map<Role, Map<SquareName, SquareName[]>> {
  const byRole = new Map<Role, Map<SquareName, SquareName[]>>();
  for (const [from, dests] of legalDests(pos)) {
    const role = roleAt(pos, from);
    if (!role) continue;
    const forRole = byRole.get(role) ?? new Map<SquareName, SquareName[]>();
    forRole.set(from, dests);
    byRole.set(role, forRole);
  }
  return byRole;
}
