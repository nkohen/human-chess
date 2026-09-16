import { describe, expect, it } from 'vitest';
import { EQUALITY_BAND_CP, judgeVote } from './vote';

describe('judgeVote', () => {
  it('judges "equal" right within the equality band', () => {
    expect(judgeVote('equal', 0)).toBe('right');
    expect(judgeVote('equal', EQUALITY_BAND_CP)).toBe('right');
    expect(judgeVote('equal', -EQUALITY_BAND_CP)).toBe('right');
  });

  it('judges "equal" wrong outside the equality band', () => {
    expect(judgeVote('equal', EQUALITY_BAND_CP + 1)).toBe('wrong');
    expect(judgeVote('equal', -EQUALITY_BAND_CP - 1)).toBe('wrong');
  });

  it('judges white/black votes against the sign of the mining eval outside the band', () => {
    expect(judgeVote('white', 40)).toBe('right');
    expect(judgeVote('black', 40)).toBe('wrong');
    expect(judgeVote('black', -40)).toBe('right');
    expect(judgeVote('white', -40)).toBe('wrong');
  });

  it('judges a white/black vote wrong inside the equality band', () => {
    expect(judgeVote('white', 10)).toBe('wrong');
    expect(judgeVote('black', -10)).toBe('wrong');
  });
});
