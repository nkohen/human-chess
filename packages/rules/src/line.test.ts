import { describe, expect, it } from 'vitest';
import { annotateLine, formatLine } from './line';
import { START_FEN } from './index';

describe('annotateLine', () => {
  it('numbers a line that starts with White', () => {
    expect(formatLine(START_FEN, ['e2e4', 'e7e5', 'g1f3'])).toBe('1. e4 e5 2. Nf3');
  });
  it('numbers a line that starts with Black', () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(formatLine(afterE4, ['e7e5', 'g1f3', 'b8c6'])).toBe('1… e5 2. Nf3 Nc6');
  });
  it('carries the position after each ply', () => {
    const plies = annotateLine(START_FEN, ['e2e4', 'e7e5']);
    expect(plies[0]?.fenAfter).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(plies[1]?.color).toBe('black');
    expect(plies[1]?.fenAfter).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  });
  it('rejects an illegal move', () => {
    expect(() => annotateLine(START_FEN, ['e2e5'])).toThrow();
  });
});
