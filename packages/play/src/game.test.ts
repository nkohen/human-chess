import { describe, expect, it } from 'vitest';
import { applyMove, currentFen, describeEnd, isPlayersTurn, playerDests, result, resumeGame, startGame, uciMoves } from './game';

const fen = '8/8/8/4k3/8/8/8/R3K2R w - - 0 1';

describe('game', () => {
  it('starts with the player to move whichever colour was passed', () => {
    const w = startGame(fen, 'white');
    expect(isPlayersTurn(w)).toBe(true);
    expect(playerDests(w).size).toBeGreaterThan(0);

    const blackToMoveFen = 'r3k2r/8/8/8/4K3/8/8/8 b - - 0 1';
    const b = startGame(blackToMoveFen, 'black');
    expect(currentFen(b)).toBe(blackToMoveFen);
    expect(isPlayersTurn(b)).toBe(true);
  });

  it('gives the opponent no player moves', () => {
    const g = applyMove(startGame(fen, 'white'), 'h1h5');
    expect(isPlayersTurn(g)).toBe(false);
    expect(playerDests(g).size).toBe(0);
  });

  it('recognises a win by checkmate', () => {
    const mateFen = '4k3/7R/8/8/8/8/8/R3K3 w - - 0 1';
    const g = applyMove(startGame(mateFen, 'white'), 'a1a8');
    expect(result(g)).toBe('won');
    expect(describeEnd(g)).toContain('You won');
  });

  it('recognises a loss by checkmate', () => {
    const mateFen = '4k3/7R/8/8/8/8/8/R3K3 w - - 0 1';
    const g = applyMove(startGame(mateFen, 'black'), 'a1a8');
    expect(result(g)).toBe('lost');
    expect(describeEnd(g)).toContain('checkmated');
  });

  it('recognises stalemate as a draw', () => {
    const smFen = '7k/8/4Q1K1/8/8/8/8/8 w - - 0 1';
    const g = applyMove(startGame(smFen, 'white'), 'e6f7');
    expect(result(g)).toBe('draw');
    expect(describeEnd(g)).toContain('Stalemate');
  });

  it('recognises threefold repetition as a draw', () => {
    let g = startGame(fen, 'white');
    for (const m of ['a1a2', 'e5d5', 'a2a1', 'd5e5', 'a1a2', 'e5d5', 'a2a1']) g = applyMove(g, m);
    expect(g.end).toBeUndefined();
    g = applyMove(g, 'd5e5');
    expect(g.end).toEqual({ kind: 'threefold-repetition' });
    expect(result(g)).toBe('draw');
  });
});

describe('resumeGame', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('rebuilds the same game as playing the moves one by one', () => {
    const played = applyMove(applyMove(startGame(start, 'white'), 'e2e4'), 'e7e5');
    const resumed = resumeGame(start, 'white', ['e2e4', 'e7e5']);
    expect(currentFen(resumed)).toBe(currentFen(played));
    expect(uciMoves(resumed)).toEqual(['e2e4', 'e7e5']);
    expect(resumed.moves.map(m => m.san)).toEqual(['e4', 'e5']);
    expect(resumed.seen).toEqual(played.seen);
    expect(resumed.end).toBeUndefined();
    expect(isPlayersTurn(resumed)).toBe(true);
  });

  it('restores a finished game with its end', () => {
    const mated = resumeGame(start, 'black', ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(mated.end).toEqual({ kind: 'checkmate', winner: 'black' });
    expect(result(mated)).toBe('won');
  });

  it('rejects a malformed, illegal or post-mortem move list as a whole', () => {
    expect(() => resumeGame(start, 'white', ['e2e5'])).toThrow();
    expect(() => resumeGame(start, 'white', ['zz'])).toThrow();
    expect(() => resumeGame(start, 'black', ['f2f3', 'e7e5', 'g2g4', 'd8h4', 'a2a3'])).toThrow();
  });
});
