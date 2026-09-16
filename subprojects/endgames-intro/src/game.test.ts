import { describe, expect, it } from 'vitest';
import { applyMove, currentFen, describeEnd, isPlayersTurn, playerDests, result, startGame } from './game';
import type { EndgameLesson } from '@human-chess/positions';

const lesson: EndgameLesson = { id: 't', stage: 1, title: 't', fen: '8/8/8/4k3/8/8/8/R3K2R w - - 0 1', intro: '' };

describe('lesson game', () => {
  it('starts with the player to move whichever colour they got', () => {
    const w = startGame(lesson, 'white');
    expect(isPlayersTurn(w)).toBe(true);
    expect(playerDests(w).size).toBeGreaterThan(0);
    const b = startGame(lesson, 'black');
    expect(currentFen(b)).toBe('r3k2r/8/8/8/4K3/8/8/8 b - - 0 1');
    expect(isPlayersTurn(b)).toBe(true);
  });

  it('gives the opponent no player moves', () => {
    const g = applyMove(startGame(lesson, 'white'), 'h1h5');
    expect(isPlayersTurn(g)).toBe(false);
    expect(playerDests(g).size).toBe(0);
  });

  it('recognises a win by checkmate', () => {
    const mate: EndgameLesson = { ...lesson, fen: '4k3/7R/8/8/8/8/8/R3K3 w - - 0 1' };
    const g = applyMove(startGame(mate, 'white'), 'a1a8');
    expect(result(g)).toBe('won');
    expect(describeEnd(g)).toContain('You won');
  });

  it('recognises a win by checkmate as Black on the mirrored board', () => {
    const mate: EndgameLesson = { ...lesson, fen: '4k3/7R/8/8/8/8/8/R3K3 w - - 0 1' };
    const g = applyMove(startGame(mate, 'black'), 'a8a1');
    expect(result(g)).toBe('won');
  });

  it('recognises stalemate as not won', () => {
    const sm: EndgameLesson = { ...lesson, fen: '7k/8/4Q1K1/8/8/8/8/8 w - - 0 1' };
    const g = applyMove(startGame(sm, 'white'), 'e6f7');
    expect(result(g)).toBe('not-won');
    expect(describeEnd(g)).toContain('Stalemate');
  });

  it('recognises threefold repetition', () => {
    let g = startGame(lesson, 'white');
    for (const m of ['a1a2', 'e5d5', 'a2a1', 'd5e5', 'a1a2', 'e5d5', 'a2a1']) g = applyMove(g, m);
    expect(g.end).toBeUndefined();
    g = applyMove(g, 'd5e5');
    expect(g.end).toEqual({ kind: 'threefold-repetition' });
    expect(result(g)).toBe('not-won');
  });
});
