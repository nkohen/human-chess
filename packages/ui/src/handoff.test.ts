import { afterEach, describe, expect, it, vi } from 'vitest';
import { handoffHash, navigateWithHandoff, readHandoffParams, routeOf } from './handoff';

describe('handoffHash', () => {
  it('attaches a query string built from params', () => {
    expect(handoffHash('#/bot-rating', { fen: 'r1', color: 'white' })).toBe('#/bot-rating?fen=r1&color=white');
  });

  it('returns the hash unchanged when params is empty', () => {
    expect(handoffHash('#/opening-game', {})).toBe('#/opening-game');
  });

  it('URL-encodes values, so a FEN with spaces and slashes round-trips', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const hash = handoffHash('#/bot-rating', { fen });
    expect(readHandoffParams(hash).get('fen')).toBe(fen);
  });
});

describe('routeOf', () => {
  it('returns a plain hash unchanged', () => {
    expect(routeOf('#/puzzles')).toBe('#/puzzles');
  });

  it('strips the query part of a hand-off hash', () => {
    expect(routeOf('#/bot-rating?fen=x&color=white')).toBe('#/bot-rating');
  });

  it('treats a bare "#/route?" (empty query) the same as no query', () => {
    expect(routeOf('#/review?')).toBe('#/review');
  });
});

describe('readHandoffParams', () => {
  it('parses the query part of a hash route', () => {
    const params = readHandoffParams('#/bot-rating?fen=x&color=black&blindfold=1');
    expect(params.get('fen')).toBe('x');
    expect(params.get('color')).toBe('black');
    expect(params.get('blindfold')).toBe('1');
  });

  it('returns an empty URLSearchParams when there is no query part', () => {
    const params = readHandoffParams('#/bot-rating');
    expect(params.toString()).toBe('');
    expect(params.has('fen')).toBe(false);
  });

  it('returns an empty URLSearchParams for an empty hash', () => {
    expect(readHandoffParams('').toString()).toBe('');
  });
});

describe('navigateWithHandoff', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets window.location.hash to handoffHash(hash, params)', () => {
    const location = { hash: '' };
    vi.stubGlobal('window', { location });
    navigateWithHandoff('#/bot-rating', { fen: 'r1', color: 'white' });
    expect(location.hash).toBe('#/bot-rating?fen=r1&color=white');
  });
});
