import { describe, expect, it } from 'vitest';
import { call, callableRoles, describeEnd, move, moveLines, startGame } from './game';

describe('hand and brain game', () => {
  it('only offers roles with a legal move at the start', () => {
    expect(callableRoles(startGame())).toEqual(['pawn', 'knight']);
  });

  it('the callable set follows legality as the position changes, not a fixed list', () => {
    let g = startGame();
    g = move(call(g, 'pawn'), 'e2', 'e4');
    g = move(call(g, 'pawn'), 'e7', 'e5');
    // With both e-pawns advanced, White's queen and dark bishop have legal moves too.
    expect(callableRoles(g)).toEqual(expect.arrayContaining(['pawn', 'knight', 'bishop', 'queen']));
  });

  it('rejects calling a role with no legal move', () => {
    expect(() => call(startGame(), 'queen')).toThrow();
  });

  it('rejects calling twice before moving', () => {
    const g = call(startGame(), 'pawn');
    expect(() => call(g, 'knight')).toThrow();
  });

  it('rejects a move whose piece does not match the call', () => {
    const g = call(startGame(), 'pawn');
    expect(() => move(g, 'g1', 'f3')).toThrow();
  });

  it('rejects moving before a call', () => {
    expect(() => move(startGame(), 'e2', 'e4')).toThrow();
  });

  it('clears the call after a move so the next turn requires a fresh one', () => {
    const g = move(call(startGame(), 'pawn'), 'e2', 'e4');
    expect(g.calledRole).toBeUndefined();
    expect(g.moves).toEqual([{ color: 'white', role: 'pawn', san: 'e4', uci: 'e2e4' }]);
  });

  it('formats the move list with call letters', () => {
    let g = startGame();
    g = move(call(g, 'pawn'), 'e2', 'e4');
    g = move(call(g, 'pawn'), 'e7', 'e5');
    expect(moveLines(g)).toEqual(['1. P: e4   P: e5']);
  });

  it('detects checkmate (fool\'s mate) in plain words', () => {
    let g = startGame();
    g = move(call(g, 'pawn'), 'f2', 'f3');
    g = move(call(g, 'pawn'), 'e7', 'e5');
    g = move(call(g, 'pawn'), 'g2', 'g4');
    g = move(call(g, 'queen'), 'd8', 'h4');
    expect(g.end).toEqual({ kind: 'checkmate', winner: 'black' });
    expect(callableRoles(g)).toEqual([]);
    expect(describeEnd(g)).toBe('Checkmate. Black wins.');
    expect(() => call(g, 'pawn')).toThrow();
  });
});
