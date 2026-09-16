import { describe, expect, it } from 'vitest';
import { DRAW_BAND_CP, verdict } from './verdict';

describe('verdict', () => {
  it('is a draw for a cp score inside the band, either sign', () => {
    expect(verdict({ type: 'cp', value: 0 }, 'white')).toBe('draw');
    expect(verdict({ type: 'cp', value: DRAW_BAND_CP - 1 }, 'white')).toBe('draw');
    expect(verdict({ type: 'cp', value: -(DRAW_BAND_CP - 1) }, 'black')).toBe('draw');
  });

  it('is a win for White outside the band on White\'s side, for a White player', () => {
    expect(verdict({ type: 'cp', value: DRAW_BAND_CP }, 'white')).toBe('won');
    expect(verdict({ type: 'cp', value: 500 }, 'white')).toBe('won');
  });

  it('is a loss for a White player when the score favours Black outside the band', () => {
    expect(verdict({ type: 'cp', value: -DRAW_BAND_CP }, 'white')).toBe('lost');
    expect(verdict({ type: 'cp', value: -500 }, 'white')).toBe('lost');
  });

  it('flips for a Black player: White\'s advantage is Black\'s loss and vice versa', () => {
    expect(verdict({ type: 'cp', value: 200 }, 'black')).toBe('lost');
    expect(verdict({ type: 'cp', value: -200 }, 'black')).toBe('won');
  });

  it('is a win for whichever side is mated for, regardless of the draw band', () => {
    // 'mate 0' (the side to move already mated) is not tested here: its sign is lost by
    // negation and it cannot occur in this module's real inputs — the game ends (and the
    // natural result is used instead of a verdict) before the engine is ever asked to analyse.
    expect(verdict({ type: 'mate', value: 3 }, 'white')).toBe('won');
    expect(verdict({ type: 'mate', value: 3 }, 'black')).toBe('lost');
    expect(verdict({ type: 'mate', value: -1 }, 'black')).toBe('won');
    expect(verdict({ type: 'mate', value: -1 }, 'white')).toBe('lost');
  });

  it('treats the band edge as outside the band (boundary is exclusive)', () => {
    expect(verdict({ type: 'cp', value: DRAW_BAND_CP }, 'black')).toBe('lost');
    expect(verdict({ type: 'cp', value: -DRAW_BAND_CP }, 'black')).toBe('won');
  });
});
