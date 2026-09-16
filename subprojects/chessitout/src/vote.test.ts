import { describe, expect, it } from 'vitest';
import type { Score } from '@human-chess/engine';
import { EQUALITY_BAND_CP, judgeVote } from './vote';

const cp = (value: number): Score => ({ type: 'cp', value });
const mate = (value: number): Score => ({ type: 'mate', value });

describe('judgeVote', () => {
  it('judges "equal" right within the equality band', () => {
    expect(judgeVote('equal', cp(0))).toBe('right');
    expect(judgeVote('equal', cp(EQUALITY_BAND_CP))).toBe('right');
    expect(judgeVote('equal', cp(-EQUALITY_BAND_CP))).toBe('right');
  });

  it('judges "equal" wrong outside the equality band', () => {
    expect(judgeVote('equal', cp(EQUALITY_BAND_CP + 1))).toBe('wrong');
    expect(judgeVote('equal', cp(-EQUALITY_BAND_CP - 1))).toBe('wrong');
  });

  it('judges white/black votes against the sign of the mining eval outside the band', () => {
    expect(judgeVote('white', cp(40))).toBe('right');
    expect(judgeVote('black', cp(40))).toBe('wrong');
    expect(judgeVote('black', cp(-40))).toBe('right');
    expect(judgeVote('white', cp(-40))).toBe('wrong');
  });

  it('judges a white/black vote wrong inside the equality band', () => {
    expect(judgeVote('white', cp(10))).toBe('wrong');
    expect(judgeVote('black', cp(-10))).toBe('wrong');
  });

  it('judges a mate score decisive for the mating side, never "equal"', () => {
    expect(judgeVote('white', mate(1))).toBe('right');
    expect(judgeVote('equal', mate(1))).toBe('wrong');
    expect(judgeVote('black', mate(1))).toBe('wrong');
    expect(judgeVote('black', mate(-3))).toBe('right');
    expect(judgeVote('equal', mate(-3))).toBe('wrong');
  });

  it('judges mate 0 (checkmate already on the board) decisive too, not "equal"', () => {
    expect(judgeVote('white', mate(0))).toBe('right');
    expect(judgeVote('equal', mate(0))).toBe('wrong');
  });
});
