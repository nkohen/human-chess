// @vitest-environment jsdom
// Reload survival: seeds localStorage with a persisted snapshot and asserts the mounted screen
// resumes from it, and that a fresh cross-tool hand-off (packages/ui/src/handoff.ts) overrides
// whatever was persisted and leaves the URL stripped of its query. Nothing here contacts
// lichess.org or api.chess.com — the only "engine" is a stub, never a real network call.
//
// BotRatingTest shows "Loading the engine..." for as long as `engine` is undefined/Error,
// before it ever looks at the persisted screen (see BotRatingTest.tsx's early returns), so a
// minimal stub UciEngine is used to reach the restored setup/game views. The stubbed games below
// are always mid-game with the player to move, so useEngineGame's opponent-turn effect (which
// would call real engine methods) never fires.
import type { UciEngine } from '@human-chess/engine';
import { resumeGame, uciMoves } from '@human-chess/play';
import { START_FEN } from '@human-chess/rules';
import { createElement } from 'react';
import { cleanup, render, screen as dom } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BotRatingTest } from './BotRatingTest';
import { SCREEN_KEY, type Screen } from './screen';

const stubEngine = { stop: () => {} } as unknown as UciEngine;

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = '';
});

describe('BotRatingTest reload survival', () => {
  it('resumes a game in progress at the persisted moves, not yet recorded', () => {
    const g = resumeGame(START_FEN, 'black', ['e2e4']); // white played, black (the player) to move
    const snapshot: Screen = {
      elo: 1800,
      colorChoice: 'black',
      fenText: START_FEN,
      boardMode: false,
      blindfold: false,
      active: { elo: 1800, playerColor: 'black', startFen: START_FEN },
      ucis: uciMoves(g),
      resigned: false,
      recorded: false,
    };
    localStorage.setItem(SCREEN_KEY, JSON.stringify(snapshot));

    render(createElement(BotRatingTest, { engine: stubEngine }));

    expect(dom.getByText(/Playing black against Stockfish, UCI_Elo 1800/i)).toBeTruthy();
    expect(dom.getByText('e4')).toBeTruthy(); // the move list shows the already-played move
  });

  it('keeps a finished, already-recorded game visible and does not record it again', () => {
    const g = resumeGame(START_FEN, 'white', ['f2f3', 'e7e5', 'g2g4', 'd8h4']); // fool's mate
    const snapshot: Screen = {
      elo: 1500,
      colorChoice: 'white',
      fenText: START_FEN,
      boardMode: false,
      blindfold: false,
      active: { elo: 1500, playerColor: 'white', startFen: START_FEN },
      ucis: uciMoves(g),
      resigned: false,
      recorded: true,
    };
    localStorage.setItem(SCREEN_KEY, JSON.stringify(snapshot));

    render(createElement(BotRatingTest, { engine: stubEngine }));

    // The finished position stays visible (Checkmate), and the recordedRef guard restored from
    // screen.recorded means no new record is appended — "Play suggested level"/"Change settings"
    // are the finished-game actions, not a live "Resign" button.
    expect(dom.getByText(/Checkmate/i)).toBeTruthy();
    expect(dom.getByText('Play suggested level')).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem(SCREEN_KEY) ?? 'null') as Screen | null;
    expect(stored?.recorded).toBe(true);
  });

  it('shows the setup screen (with persisted setup fields) when no game is in progress', () => {
    const snapshot: Screen = {
      elo: 1820, // an exact ELO_LEVELS step (MIN_UCI_ELO 1320 + 5*100), so the <select> matches it
      colorChoice: 'black',
      fenText: START_FEN,
      boardMode: false,
      blindfold: true,
      active: undefined,
      ucis: [],
      resigned: false,
      recorded: true,
    };
    localStorage.setItem(SCREEN_KEY, JSON.stringify(snapshot));

    render(createElement(BotRatingTest, { engine: stubEngine }));

    expect(dom.getByText('Start')).toBeTruthy();
    const eloSelect = dom.getByLabelText(/Bot level/i) as HTMLSelectElement;
    expect(eloSelect.value).toBe('1820');
  });

  it('a fresh hand-off overrides an existing persisted snapshot and strips the URL query', () => {
    // A game-in-progress snapshot is already persisted from a previous visit...
    const g = resumeGame(START_FEN, 'black', ['e2e4']);
    const staleSnapshot: Screen = {
      elo: 1800,
      colorChoice: 'black',
      fenText: START_FEN,
      boardMode: false,
      blindfold: false,
      active: { elo: 1800, playerColor: 'black', startFen: START_FEN },
      ucis: uciMoves(g),
      resigned: false,
      recorded: false,
    };
    localStorage.setItem(SCREEN_KEY, JSON.stringify(staleSnapshot));

    // ...but this load arrives via a fresh cross-tool hand-off (e.g. from the game reviewer).
    const handoffFen = '8/8/8/8/8/8/8/K6k w - - 0 1';
    window.location.hash = `#/bot-rating?fen=${encodeURIComponent(handoffFen)}&color=white`;

    render(createElement(BotRatingTest, { engine: stubEngine }));

    // The hand-off's setup screen wins: no active game, the handed-over FEN is showing, not the
    // stale in-progress game.
    expect(dom.getByText('Start')).toBeTruthy();
    expect(dom.queryByText(/Playing black against Stockfish/i)).toBeNull();
    const fenInput = dom.getByLabelText(/Start position/i) as HTMLInputElement;
    expect(fenInput.value).toBe(handoffFen);
    expect(dom.getByText(/handed over from another human-chess tool/i)).toBeTruthy();

    // The hand-off params are consumed: the URL no longer carries the query string.
    expect(window.location.hash).toBe('#/bot-rating');

    // The stale snapshot was cleared before usePersistedState ever read storage (so it fell
    // through to the hand-off-seeded value); usePersistedState itself never writes back on the
    // very first mount render (packages/ui/src/persisted.ts), so storage is empty right after
    // mount — the next real interaction (or the game-sync effect once a game starts) is what
    // persists the new screen from here on.
    expect(localStorage.getItem(SCREEN_KEY)).toBeNull();
  });
});
