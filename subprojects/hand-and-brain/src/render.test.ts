// @vitest-environment jsdom
// Reload survival: seeds localStorage with a persisted snapshot and asserts the mounted screen
// resumes from it, never lichess.org/api.chess.com (this subproject makes no network calls at
// all — humans only, no engine — so there is nothing to block here beyond not adding any).
import { createElement } from 'react';
import { cleanup, render, screen as dom } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { call, move, startGame } from './game';
import { HandAndBrain } from './HandAndBrain';
import { SCREEN_KEY, type Screen } from './screen';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('HandAndBrain reload survival', () => {
  it('resumes a game in progress (moves played, no pending call)', () => {
    let g = startGame();
    g = move(call(g, 'pawn'), 'e2', 'e4');
    g = move(call(g, 'knight'), 'b8', 'c6');
    const snapshot: Screen = { ucis: g.moves.map(m => m.uci), calledRole: undefined };
    localStorage.setItem(SCREEN_KEY, JSON.stringify(snapshot));

    render(createElement(HandAndBrain));

    // White to move again after 1. e4 Nc6: the brain must call a piece.
    expect(dom.getByText(/White's brain: call a piece/i)).toBeTruthy();
    expect(dom.getByText(/1\.\s+P: e4\s+N: Nc6/)).toBeTruthy();
  });

  it('resumes the mid-turn phase: brain has called, hand has not moved', () => {
    let g = startGame();
    g = move(call(g, 'pawn'), 'e2', 'e4');
    g = call(g, 'knight');
    const snapshot: Screen = { ucis: g.moves.map(m => m.uci), calledRole: g.calledRole };
    localStorage.setItem(SCREEN_KEY, JSON.stringify(snapshot));

    render(createElement(HandAndBrain));

    expect(dom.getByText(/Black's hand: move a knight/i)).toBeTruthy();
  });
});
