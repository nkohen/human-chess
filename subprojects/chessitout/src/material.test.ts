import { describe, expect, it } from 'vitest';
import type { Color, Role } from '@human-chess/rules';
import { describeMaterialDifference } from './material';

function counts(white: Partial<Record<Role, number>>, black: Partial<Record<Role, number>>): Record<Color, Record<Role, number>> {
  const zero: Record<Role, number> = { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 1 };
  return { white: { ...zero, ...white }, black: { ...zero, ...black } };
}

describe('describeMaterialDifference', () => {
  it('reports equal material', () => {
    expect(describeMaterialDifference(counts({ pawn: 8 }, { pawn: 8 }))).toBe('Material is equal.');
  });

  it('reports a one-sided extra piece', () => {
    expect(describeMaterialDifference(counts({ rook: 1 }, {}))).toBe('White is up a rook.');
    expect(describeMaterialDifference(counts({}, { rook: 1 }))).toBe('Black is up a rook.');
  });

  it('reports an exchange-style imbalance affecting both sides', () => {
    expect(describeMaterialDifference(counts({ knight: 1, pawn: 1 }, { rook: 1 }))).toBe(
      'White: a knight and a pawn for a rook.',
    );
  });

  it('pluralizes multiple extra pieces of the same role', () => {
    expect(describeMaterialDifference(counts({ pawn: 2 }, {}))).toBe('White is up two pawns.');
  });

  it('lists three or more extras with a serial comma, in queen-to-pawn order', () => {
    expect(describeMaterialDifference(counts({ knight: 1, bishop: 1, pawn: 2 }, { queen: 1 }))).toBe(
      'White: a bishop, a knight, and two pawns for a queen.',
    );
  });
});
