// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { consumeHandoffParams } from './handoff';

describe('consumeHandoffParams', () => {
  it('returns the params and strips them from the URL without changing the route', () => {
    window.location.hash = '#/bot-rating?fen=8%2F8%2F8%2F8%2F8%2F8%2F8%2FK6k%20w%20-%20-%200%201&color=white';
    const params = consumeHandoffParams(window.location.hash);
    expect(params.get('color')).toBe('white');
    expect(params.get('fen')).toBe('8/8/8/8/8/8/8/K6k w - - 0 1');
    expect(window.location.hash).toBe('#/bot-rating');
  });

  it('is a plain read when there is nothing to consume', () => {
    window.location.hash = '#/puzzles';
    expect([...consumeHandoffParams(window.location.hash).keys()]).toEqual([]);
    expect(window.location.hash).toBe('#/puzzles');
  });
});
