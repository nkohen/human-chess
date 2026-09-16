import { describe, expect, it } from 'vitest';
import { legalDestsByRole, positionFromFen, roleAt } from './index';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('roles', () => {
  it('reads the piece on a square from the board, not by guessing', () => {
    const pos = positionFromFen(START);
    expect(roleAt(pos, 'e1')).toBe('king');
    expect(roleAt(pos, 'e2')).toBe('pawn');
    expect(roleAt(pos, 'g1')).toBe('knight');
    expect(roleAt(pos, 'e4')).toBeUndefined();
  });

  it('only offers pawn and knight in the start position', () => {
    const byRole = legalDestsByRole(positionFromFen(START));
    expect(new Set(byRole.keys())).toEqual(new Set(['pawn', 'knight']));
    expect(byRole.get('pawn')?.get('e2')).toEqual(expect.arrayContaining(['e3', 'e4']));
    expect(byRole.get('knight')?.get('g1')).toEqual(expect.arrayContaining(['f3', 'h3']));
  });

  it('restricts the callable set to roles that actually answer a check', () => {
    // Black king on e8 in check from the white rook on e1 along the open e-file. Black also
    // has a knight on b7 and a pawn on a7, but neither move blocks the file or captures the
    // rook, so only the king's moves are legal even though the other pieces "have moves".
    const pos = positionFromFen('4k3/pn6/8/8/8/8/8/4R2K b - - 0 1');
    const byRole = legalDestsByRole(pos);
    expect(new Set(byRole.keys())).toEqual(new Set(['king']));
    expect(new Set(byRole.get('king')?.get('e8'))).toEqual(new Set(['d8', 'd7', 'f8', 'f7']));
  });
});
