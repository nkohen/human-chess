import { resumeGame, uciMoves } from '@human-chess/play';
import { START_FEN } from '@human-chess/rules';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultScreen, parseScreen, screenFromHandoff, type Screen } from './screen';

afterEach(() => {
  // defaultScreen/parseScreen never touch storage themselves, but stay tidy for any test run
  // alongside records.test.ts in the same file/worker.
  try {
    globalThis.localStorage?.clear();
  } catch {
    // no localStorage in this environment: nothing to clear
  }
});

describe('bot-rating-test screen snapshot', () => {
  it('round-trips the setup screen', () => {
    const screen = defaultScreen();
    const parsed = parseScreen(JSON.parse(JSON.stringify(screen)));
    expect(parsed).toEqual(screen);
  });

  it('round-trips a game in progress, not yet recorded', () => {
    const g = resumeGame(START_FEN, 'black', ['e2e4']);
    const screen: Screen = {
      elo: 1820,
      colorChoice: 'black',
      fenText: START_FEN,
      boardMode: false,
      blindfold: true,
      active: { elo: 1820, playerColor: 'black', startFen: START_FEN },
      ucis: uciMoves(g),
      resigned: false,
      recorded: false,
    };
    const parsed = parseScreen(JSON.parse(JSON.stringify(screen)));
    expect(parsed).toEqual(screen);
  });

  it('round-trips a finished, already-recorded game (stays visible, never re-recorded)', () => {
    const g = resumeGame(START_FEN, 'white', ['f2f3', 'e7e5', 'g2g4', 'd8h4']); // fool's mate
    const screen: Screen = {
      elo: 1820,
      colorChoice: 'white',
      fenText: START_FEN,
      boardMode: false,
      blindfold: false,
      active: { elo: 1820, playerColor: 'white', startFen: START_FEN },
      ucis: uciMoves(g),
      resigned: false,
      recorded: true,
    };
    const parsed = parseScreen(JSON.parse(JSON.stringify(screen)));
    expect(parsed).toEqual(screen);
    expect(parsed?.recorded).toBe(true);
  });

  it('builds the setup screen from a fresh hand-off, ignoring any active game entirely', () => {
    const params = new URLSearchParams({ fen: START_FEN, color: 'black', blindfold: '1' });
    const screen = screenFromHandoff(params);
    expect(screen.colorChoice).toBe('black');
    expect(screen.fenText).toBe(START_FEN);
    expect(screen.blindfold).toBe(true);
    expect(screen.active).toBeUndefined();
    expect(screen.ucis).toEqual([]);
  });

  it('rejects a stale/corrupt shape', () => {
    expect(parseScreen(undefined)).toBeUndefined();
    expect(parseScreen({})).toBeUndefined();
    expect(parseScreen({ ...defaultScreen(), colorChoice: 'purple' })).toBeUndefined();
    expect(parseScreen({ ...defaultScreen(), ucis: 'e2e4' })).toBeUndefined();
    // moves with no active game: inconsistent
    expect(parseScreen({ ...defaultScreen(), ucis: ['e2e4'] })).toBeUndefined();
    // active missing a field
    expect(parseScreen({ ...defaultScreen(), active: { elo: 1820, playerColor: 'white' } })).toBeUndefined();
  });

  it('rejects an illegal move list as a whole, not just the bad move', () => {
    const screen = {
      ...defaultScreen(),
      active: { elo: 1820, playerColor: 'white', startFen: START_FEN },
      ucis: ['e2e4', 'e2e4'], // second move replays an already-vacated square
    };
    expect(parseScreen(screen)).toBeUndefined();
  });

  it('rejects an elo outside the UI-offered levels, top-level or on an active game', () => {
    expect(parseScreen({ ...defaultScreen(), elo: 1801 })).toBeUndefined(); // not a 100-step level
    expect(parseScreen({ ...defaultScreen(), elo: 50 })).toBeUndefined(); // below MIN_UCI_ELO
    expect(parseScreen({ ...defaultScreen(), elo: 9999 })).toBeUndefined(); // above MAX_UCI_ELO
    expect(
      parseScreen({ ...defaultScreen(), active: { elo: 1801, playerColor: 'white', startFen: START_FEN } }),
    ).toBeUndefined();
  });
});
