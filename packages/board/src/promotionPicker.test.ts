import { describe, expect, it } from 'vitest';
import { promotionSquareLayout } from './promotionPicker';

describe('promotionSquareLayout', () => {
  it('stacks downward from a top-row destination (white pawn, white orientation)', () => {
    const squares = promotionSquareLayout('e8', 'white');
    expect(squares.map(s => s.role)).toEqual(['queen', 'knight', 'rook', 'bishop']);
    expect(squares.map(s => s.topPct)).toEqual([0, 12.5, 25, 37.5]);
    expect(squares.every(s => s.leftPct === 50)).toBe(true);
  });

  it('flips both axes when the board is flipped (black orientation): e8 is black\'s own back rank, at the bottom of a black-oriented board', () => {
    const squares = promotionSquareLayout('e8', 'black');
    expect(squares.map(s => s.topPct)).toEqual([87.5, 75, 62.5, 50]);
    expect(squares.every(s => s.leftPct === 37.5)).toBe(true);
  });

  it('stacks upward from a bottom-row destination (black pawn promoting on rank 1, white orientation)', () => {
    const squares = promotionSquareLayout('e1', 'white');
    expect(squares.map(s => s.topPct)).toEqual([87.5, 75, 62.5, 50]);
    expect(squares.every(s => s.leftPct === 50)).toBe(true);
  });

  it('is on the a-file at the left edge and the h-file at the right edge, white orientation', () => {
    expect(promotionSquareLayout('a8', 'white')[0]!.leftPct).toBe(0);
    expect(promotionSquareLayout('h8', 'white')[0]!.leftPct).toBe(87.5);
  });
});
