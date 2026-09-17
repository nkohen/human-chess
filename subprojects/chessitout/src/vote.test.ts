import { describe, expect, it } from 'vitest';
import type { Score } from '@human-chess/engine';
import { judgeVote } from './vote';

const cp = (value: number): Score => ({ type: 'cp', value });
const mate = (value: number): Score => ({ type: 'mate', value });

describe('judgeVote', () => {
  it('judges white/black votes against the sign of the mining eval', () => {
    expect(judgeVote('white', cp(120))).toBe('right');
    expect(judgeVote('black', cp(120))).toBe('wrong');
    expect(judgeVote('black', cp(-120))).toBe('right');
    expect(judgeVote('white', cp(-120))).toBe('wrong');
  });

  it('judges the smallest and largest banded scores correctly (100 and 350 cp)', () => {
    expect(judgeVote('white', cp(100))).toBe('right');
    expect(judgeVote('black', cp(100))).toBe('wrong');
    expect(judgeVote('white', cp(350))).toBe('right');
    expect(judgeVote('black', cp(-350))).toBe('right');
  });

  it('judges a cp score of exactly 0 wrong for either vote (should not occur given the band)', () => {
    expect(judgeVote('white', cp(0))).toBe('wrong');
    expect(judgeVote('black', cp(0))).toBe('wrong');
  });

  it('judges a mate score decisive for the mating side', () => {
    expect(judgeVote('white', mate(1))).toBe('right');
    expect(judgeVote('black', mate(1))).toBe('wrong');
    expect(judgeVote('black', mate(-3))).toBe('right');
    expect(judgeVote('white', mate(-3))).toBe('wrong');
  });

  it('judges mate 0 (checkmate already on the board) decisive too', () => {
    expect(judgeVote('white', mate(0))).toBe('right');
    expect(judgeVote('black', mate(0))).toBe('wrong');
  });
});
