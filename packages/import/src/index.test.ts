import { describe, expect, it } from 'vitest';
import { importPgn } from './index';

describe('importPgn', () => {
  it('wraps a pasted PGN as a source: pgn ImportedGame with no username or playedAs', () => {
    const game = importPgn('1. e4 e5 *');
    expect(game.source).toBe('pgn');
    expect(game.username).toBeUndefined();
    expect(game.playedAs).toBeUndefined();
    expect(game.ucis).toEqual(['e2e4', 'e7e5']);
    expect(game.url).toBeUndefined();
    expect(game.playedAt).toBeUndefined();
  });

  it('takes url and playedAt from the headers only when they are actually a URL and a full UTC date-time', () => {
    const game = importPgn(
      '[Site "https://lichess.org/abcd1234"]\n[UTCDate "2026.03.10"]\n[UTCTime "18:00:00"]\n\n1. e4 e5 *',
    );
    expect(game.url).toBe('https://lichess.org/abcd1234');
    expect(game.playedAt).toBe('2026-03-10T18:00:00Z');
  });

  it('never invents url or playedAt: a bare Site name, or a partial or malformed date, gives undefined', () => {
    expect(importPgn('[Site "Chess.com"]\n\n1. e4 e5 *').url).toBeUndefined();
    expect(importPgn('[UTCDate "2026.03.10"]\n\n1. e4 e5 *').playedAt).toBeUndefined();
    expect(importPgn('[UTCDate "March 10"]\n[UTCTime "18:00:00"]\n\n1. e4 e5 *').playedAt).toBeUndefined();
    expect(importPgn('[Link "https://www.chess.com/game/live/1"]\n[Site "Chess.com"]\n\n1. e4 e5 *').url).toBe(
      'https://www.chess.com/game/live/1',
    );
  });
});
