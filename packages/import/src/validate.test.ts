import { describe, expect, it } from 'vitest';
import type { ImportedGame } from './types';
import { isImportedGame } from './validate';

const GAME: ImportedGame = {
  source: 'pgn',
  username: undefined,
  pgn: '1. e4 e5 2. Nf3 Nc6',
  headers: {},
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  ucis: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
  sans: ['e4', 'e5', 'Nf3', 'Nc6'],
  white: undefined,
  black: undefined,
  result: undefined,
  playedAs: 'white',
  url: undefined,
  playedAt: undefined,
};

describe('isImportedGame', () => {
  it('accepts a well-formed game with all optional fields undefined', () => {
    expect(isImportedGame(GAME)).toBe(true);
  });

  it('accepts a well-formed game with all optional fields populated, including meta', () => {
    const full: ImportedGame = {
      ...GAME,
      username: 'nkohen',
      white: 'nkohen',
      black: 'opponent',
      result: '1-0',
      url: 'https://lichess.org/abcd1234',
      playedAt: '2026-03-10T18:00:00Z',
      meta: { speed: 'blitz', rated: true, whiteElo: 1500, blackElo: 1490, eco: 'C50', openingName: 'Italian Game' },
    };
    expect(isImportedGame(full)).toBe(true);
  });

  it('rejects a non-record value', () => {
    expect(isImportedGame(undefined)).toBe(false);
    expect(isImportedGame(null)).toBe(false);
    expect(isImportedGame('not-a-game')).toBe(false);
    expect(isImportedGame(42)).toBe(false);
  });

  it('rejects an invalid source', () => {
    expect(isImportedGame({ ...GAME, source: 'chess24' })).toBe(false);
  });

  it('rejects a non-array ucis or sans field', () => {
    expect(isImportedGame({ ...GAME, ucis: 'not-an-array' })).toBe(false);
    expect(isImportedGame({ ...GAME, sans: 'not-an-array' })).toBe(false);
  });

  it('rejects headers whose values are not all strings', () => {
    expect(isImportedGame({ ...GAME, headers: { Site: 42 } })).toBe(false);
  });

  it('rejects an invalid playedAs value', () => {
    expect(isImportedGame({ ...GAME, playedAs: 'red' })).toBe(false);
  });

  it('rejects a missing required field (pgn)', () => {
    const { pgn: _pgn, ...withoutPgn } = GAME;
    expect(isImportedGame(withoutPgn)).toBe(false);
  });

  it('rejects a wrongly-typed optional field', () => {
    expect(isImportedGame({ ...GAME, url: 42 })).toBe(false);
    expect(isImportedGame({ ...GAME, playedAt: 42 })).toBe(false);
    expect(isImportedGame({ ...GAME, username: 42 })).toBe(false);
  });

  it('rejects a non-record meta', () => {
    expect(isImportedGame({ ...GAME, meta: 'not-a-record' })).toBe(false);
  });
});
