import { describe, expect, it } from 'vitest';

import { fnv1aHash, gameId, normaliseGameUrl, toStoredGame } from './hash';
import type { ImportedGame } from './types';

function game(overrides: Partial<ImportedGame> = {}): ImportedGame {
  return {
    source: 'lichess',
    username: 'nadavk',
    pgn: '1. e4 e5 *',
    headers: { Event: 'Rated Blitz game' },
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    ucis: ['e2e4', 'e7e5'],
    sans: ['e4', 'e5'],
    white: 'nadavk',
    black: 'opponent',
    result: '*',
    playedAs: 'white',
    url: undefined,
    playedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('fnv1aHash', () => {
  it('is deterministic for the same text', () => {
    expect(fnv1aHash('same text')).toBe(fnv1aHash('same text'));
  });

  it('is an 8-hex-digit string', () => {
    expect(fnv1aHash('anything')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('differs for different text (not a guarantee, just the expected common case)', () => {
    expect(fnv1aHash('a')).not.toBe(fnv1aHash('b'));
  });
});

describe('normaliseGameUrl', () => {
  it('four spellings of the same lichess game collapse to one normalised URL', () => {
    const plain = 'https://lichess.org/abcdEFgh';
    const trailingSlash = 'https://lichess.org/abcdEFgh/';
    const whiteOrientation = 'https://lichess.org/abcdEFgh/white';
    const blackOrientation = 'https://lichess.org/abcdEFgh/black';
    const withFragment = 'https://lichess.org/abcdEFgh#42';
    const twelveCharFullId = 'https://lichess.org/abcdEFghWXYZ';

    expect(normaliseGameUrl(trailingSlash)).toBe(plain);
    expect(normaliseGameUrl(whiteOrientation)).toBe(plain);
    expect(normaliseGameUrl(blackOrientation)).toBe(plain);
    expect(normaliseGameUrl(withFragment)).toBe(plain);
    expect(normaliseGameUrl(twelveCharFullId)).toBe(plain);
  });

  it('leaves a non-lichess or already-plain URL alone', () => {
    expect(normaliseGameUrl('https://www.chess.com/game/live/12345')).toBe('https://www.chess.com/game/live/12345');
  });
});

describe('gameId', () => {
  it('uses the (normalised) url when present', () => {
    expect(gameId(game({ url: 'https://lichess.org/abcdEFgh/white' }))).toBe('https://lichess.org/abcdEFgh');
  });

  it('two url spellings of the same game produce the same id', () => {
    const a = gameId(game({ url: 'https://lichess.org/abcdEFgh/' }));
    const b = gameId(game({ url: 'https://lichess.org/abcdEFghWXYZ' }));
    expect(a).toBe(b);
  });

  it('falls back to a pgn-derived hash id when there is no url', () => {
    const id = gameId(game({ url: undefined, pgn: '1. e4 e5 *' }));
    expect(id).toBe(`pgn:${fnv1aHash('1. e4 e5 *')}`);
  });
});

describe('toStoredGame', () => {
  it('adds an id alongside every ImportedGame field', () => {
    const g = game({ url: 'https://lichess.org/abcdEFgh' });
    const stored = toStoredGame(g);
    expect(stored).toEqual({ ...g, id: 'https://lichess.org/abcdEFgh' });
  });
});
