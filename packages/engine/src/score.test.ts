import { describe, expect, it } from 'vitest';
import { formatScore, whitePerspective } from './score';

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

describe('formatScore', () => {
  it('formats a cp score in pawns', () => {
    expect(formatScore({ type: 'cp', value: 130 })).toBe('+1.3 pawns');
    expect(formatScore({ type: 'cp', value: -50 })).toBe('-0.5 pawns');
  });

  it('formats a mate score with the mating side', () => {
    expect(formatScore({ type: 'mate', value: 4 })).toBe('mate in 4 for White');
    expect(formatScore({ type: 'mate', value: -2 })).toBe('mate in 2 for Black');
  });
});
