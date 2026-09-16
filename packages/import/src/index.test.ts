import { describe, expect, it } from 'vitest';
import { importPgn } from './index';

describe('importPgn', () => {
  it('wraps a pasted PGN as a source: pgn ImportedGame with no username or playedAs', () => {
    const game = importPgn('1. e4 e5 *');
    expect(game.source).toBe('pgn');
    expect(game.username).toBeUndefined();
    expect(game.playedAs).toBeUndefined();
    expect(game.ucis).toEqual(['e2e4', 'e7e5']);
  });
});
