import { describe, expect, it } from 'vitest';
import { band, BAND_CLEAR_CP, BAND_DOMINATING_CP, BAND_SLIGHT_CP, BAND_WINNING_CP, describeBand, DECAY_CP, grade, mateSide, MAX_POINTS, points } from './scoring';

// whitePerspective's tests moved to packages/engine/src/score.test.ts along with the function.

describe('mateSide', () => {
  it('reads a positive mate value as White mating', () => {
    expect(mateSide({ type: 'mate', value: 5 })).toBe('white');
  });

  it('reads a negative mate value as Black mating', () => {
    expect(mateSide({ type: 'mate', value: -3 })).toBe('black');
  });

  it('reads mate-0 for a mated Black (-0 after whitePerspective negates) as Black, not White', () => {
    // whitePerspective flips a Black-to-move "mate 0" by negating it: -0. `-0 >= 0` is `true` in
    // JS, so a naive sign check misreads this as White mating; Object.is must catch it.
    expect(Object.is(-0, -0)).toBe(true);
    expect(mateSide({ type: 'mate', value: -0 })).toBe('black');
  });

  it('reads mate-0 for a mated White (untouched +0) as White', () => {
    expect(mateSide({ type: 'mate', value: 0 })).toBe('white');
  });
});

describe('band', () => {
  it('reports equal near zero', () => {
    expect(band({ type: 'cp', value: 0 })).toBe('equal');
    expect(band({ type: 'cp', value: BAND_SLIGHT_CP - 1 })).toBe('equal');
    expect(band({ type: 'cp', value: -(BAND_SLIGHT_CP - 1) })).toBe('equal');
  });

  it('crosses each threshold in both directions', () => {
    expect(band({ type: 'cp', value: BAND_SLIGHT_CP })).toBe('white-slight');
    expect(band({ type: 'cp', value: BAND_CLEAR_CP })).toBe('white-clear');
    expect(band({ type: 'cp', value: BAND_WINNING_CP })).toBe('white-winning');
    expect(band({ type: 'cp', value: BAND_DOMINATING_CP })).toBe('white-dominating');
    expect(band({ type: 'cp', value: -BAND_SLIGHT_CP })).toBe('black-slight');
    expect(band({ type: 'cp', value: -BAND_CLEAR_CP })).toBe('black-clear');
    expect(band({ type: 'cp', value: -BAND_WINNING_CP })).toBe('black-winning');
    expect(band({ type: 'cp', value: -BAND_DOMINATING_CP })).toBe('black-dominating');
  });

  it('reports winning (not yet dominating) just below the dominating threshold', () => {
    expect(band({ type: 'cp', value: BAND_DOMINATING_CP - 1 })).toBe('white-winning');
    expect(band({ type: 'cp', value: -(BAND_DOMINATING_CP - 1) })).toBe('black-winning');
  });

  it('treats any mate as dominating for the mating side', () => {
    expect(band({ type: 'mate', value: 5 })).toBe('white-dominating');
    expect(band({ type: 'mate', value: -1 })).toBe('black-dominating');
  });
});

describe('describeBand', () => {
  it('has plain words for every band', () => {
    expect(describeBand('equal')).toMatch(/equal/i);
    expect(describeBand('white-winning')).toMatch(/white/i);
    expect(describeBand('black-winning')).toMatch(/black/i);
    expect(describeBand('white-dominating')).toMatch(/white/i);
    expect(describeBand('black-dominating')).toMatch(/black/i);
  });
});

describe('grade', () => {
  it('reports the same band and a distance for a cp truth', () => {
    const g = grade(40, { type: 'cp', value: 45 });
    expect(g.sameBand).toBe(true);
    expect(g.distanceCp).toBe(5);
  });

  it('reports a different band when the guess crosses a threshold', () => {
    const g = grade(0, { type: 'cp', value: 250 });
    expect(g.sameBand).toBe(false);
    expect(g.distanceCp).toBe(250);
  });

  it('leaves distance undefined against a mate truth', () => {
    const g = grade(900, { type: 'mate', value: 4 });
    expect(g.sameBand).toBe(true);
    expect(g.distanceCp).toBeUndefined();
  });
});

describe('points', () => {
  it('awards the maximum for an exact guess', () => {
    expect(points(120, { type: 'cp', value: 120 })).toBe(MAX_POINTS);
    expect(points(0, { type: 'cp', value: 0 })).toBe(MAX_POINTS);
  });

  it('decays by e^-1 at one DECAY_CP of distance', () => {
    expect(points(0, { type: 'cp', value: DECAY_CP })).toBe(Math.round(MAX_POINTS * Math.exp(-1)));
    expect(points(0, { type: 'cp', value: DECAY_CP })).toBe(1839);
  });

  it('scores a mate for White against a maxed-out guess as an exact hit', () => {
    expect(points(1000, { type: 'mate', value: 4 })).toBe(MAX_POINTS);
  });

  it('scores a mate for Black against a maxed-out White guess as tiny', () => {
    const p = points(1000, { type: 'mate', value: -3 });
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(5);
  });

  it('clamps a truth beyond the slider range before computing distance', () => {
    // 1500 cp clamps to 1000, same as a truth of exactly 1000.
    expect(points(1000, { type: 'cp', value: 1500 })).toBe(points(1000, { type: 'cp', value: 1000 }));
  });

  it('is symmetric in the sign of the distance', () => {
    expect(points(50, { type: 'cp', value: 200 })).toBe(points(-50, { type: 'cp', value: -200 }));
  });
});
