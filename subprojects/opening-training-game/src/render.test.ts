// @vitest-environment jsdom
// Reload survival: seeds localStorage with a persisted snapshot and asserts the mounted screen
// resumes from it. Mounted with engine={undefined} (the "still loading" state) — nothing here
// should need the engine to reach the restored position, and nothing here contacts
// lichess.org or api.chess.com.
import { resumeGame, uciMoves } from '@human-chess/play';
import { START_FEN } from '@human-chess/rules';
import { createElement } from 'react';
import { cleanup, render, screen as dom } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OpeningTrainingGame } from './OpeningTrainingGame';
import { SCREEN_KEY, type Screen } from './screen';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('OpeningTrainingGame reload survival', () => {
  it('resumes a round in progress at the persisted moves', () => {
    const g = resumeGame(START_FEN, 'black', ['e2e4']);
    const snapshot: Screen = {
      movesN: 12,
      colorChoice: 'black',
      elo: 1500,
      settings: { movesN: 12, playerColor: 'black', elo: 1500 },
      ucis: uciMoves(g),
    };
    localStorage.setItem(SCREEN_KEY, JSON.stringify(snapshot));

    render(createElement(OpeningTrainingGame, { engine: undefined }));

    // The engine is still loading (engine={undefined}), but the restored position and round
    // settings render without it: White has already played 1. e4, playing as Black.
    expect(dom.getByText(/Loading the engine/i)).toBeTruthy();
    expect(dom.getByText(/12 moves each side/i)).toBeTruthy();
    expect(dom.getByText(/You play black/i)).toBeTruthy();
    expect(dom.getByText('e4')).toBeTruthy(); // the move list shows the played move
  });

  it('shows the setup screen (with the persisted setup fields) when no round is in progress', () => {
    const snapshot: Screen = { movesN: 20, colorChoice: 'black', elo: 2000, settings: undefined, ucis: [] };
    localStorage.setItem(SCREEN_KEY, JSON.stringify(snapshot));

    render(createElement(OpeningTrainingGame, { engine: undefined }));

    expect(dom.getByText('Start')).toBeTruthy();
    // The 20-moves preset button reflects the persisted movesN as selected.
    const button = dom.getByText('20').closest('button');
    expect(button?.getAttribute('aria-pressed')).toBe('true');
  });
});
