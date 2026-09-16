import { describe, expect, it } from 'vitest';
import { band, BAND_CLEAR_CP, BAND_SLIGHT_CP, BAND_WINNING_CP, describeBand, grade, whitePerspective } from './scoring';

describe('whitePerspective', () => {
  it('keeps a White-to-move score as is', () => {
    expect(whitePerspective({ type: 'cp', value: 50 }, 'white')).toEqual({ type: 'cp', value: 50 });
    expect(whitePerspective({ type: 'mate', value: 3 }, 'white')).toEqual({ type: 'mate', value: 3 });
  });

  it('negates a Black-to-move score, cp and mate alike', () => {
    expect(whitePerspective({ type: 'cp', value: 50 }, 'black')).toEqual({ type: 'cp', value: -50 });
    expect(whitePerspective({ type: 'mate', value: -3 }, 'black')).toEqual({ type: 'mate', value: 3 });
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
    expect(band({ type: 'cp', value: -BAND_SLIGHT_CP })).toBe('black-slight');
    expect(band({ type: 'cp', value: -BAND_CLEAR_CP })).toBe('black-clear');
    expect(band({ type: 'cp', value: -BAND_WINNING_CP })).toBe('black-winning');
  });

  it('treats any mate as winning for the mating side', () => {
    expect(band({ type: 'mate', value: 5 })).toBe('white-winning');
    expect(band({ type: 'mate', value: -1 })).toBe('black-winning');
  });
});

describe('describeBand', () => {
  it('has plain words for every band', () => {
    expect(describeBand('equal')).toMatch(/equal/i);
    expect(describeBand('white-winning')).toMatch(/white/i);
    expect(describeBand('black-winning')).toMatch(/black/i);
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
