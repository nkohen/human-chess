// The scale's segments and scoring's bands must never drift apart: each segment's className
// names the band that scoring assigns to every cp value inside it.
import { describe, expect, it } from 'vitest';
import { SEGMENTS } from './EvalScale';
import { band, SLIDER_MAX_CP, SLIDER_MIN_CP } from './scoring';

describe('EvalScale segments', () => {
  it('are contiguous over the slider range', () => {
    expect(SEGMENTS[0]?.from).toBe(SLIDER_MIN_CP);
    expect(SEGMENTS[SEGMENTS.length - 1]?.to).toBe(SLIDER_MAX_CP);
    for (let i = 1; i < SEGMENTS.length; i++) expect(SEGMENTS[i]?.from).toBe(SEGMENTS[i - 1]?.to);
  });
  // Edges are owned by the stronger band on each side (cp >= 500 and cp <= -500 are both
  // dominating), so the check is on points strictly inside each segment.
  it('each name the band scoring assigns strictly inside them', () => {
    for (const seg of SEGMENTS) {
      const name = seg.className.replace('gte-seg-', '');
      expect(band({ type: 'cp', value: seg.from + 1 })).toBe(name);
      expect(band({ type: 'cp', value: seg.to - 1 })).toBe(name);
    }
  });
});
