import { resumeGame, uciMoves } from '@human-chess/play';
import { START_FEN } from '@human-chess/rules';
import { describe, expect, it } from 'vitest';
import { defaultScreen, parseScreen, type Screen } from './screen';

describe('opening training game screen snapshot', () => {
  it('round-trips the setup screen', () => {
    const screen = defaultScreen(12, 1500);
    const parsed = parseScreen(JSON.parse(JSON.stringify(screen)));
    expect(parsed).toEqual(screen);
  });

  it('round-trips a round in progress', () => {
    const g = resumeGame(START_FEN, 'black', ['e2e4']);
    const screen: Screen = { movesN: 12, colorChoice: 'black', elo: 1500, settings: { movesN: 12, playerColor: 'black', elo: 1500 }, ucis: uciMoves(g) };
    const parsed = parseScreen(JSON.parse(JSON.stringify(screen)));
    expect(parsed).toEqual(screen);
  });

  it('rejects a stale/corrupt shape', () => {
    expect(parseScreen(undefined)).toBeUndefined();
    expect(parseScreen({})).toBeUndefined();
    expect(parseScreen({ movesN: 12, colorChoice: 'purple', elo: 1500, settings: undefined, ucis: [] })).toBeUndefined();
    expect(parseScreen({ movesN: 12, colorChoice: 'white', elo: 1500, settings: undefined, ucis: 'e2e4' })).toBeUndefined();
    // moves with no round in progress: inconsistent
    expect(parseScreen({ movesN: 12, colorChoice: 'white', elo: 1500, settings: undefined, ucis: ['e2e4'] })).toBeUndefined();
    // settings missing a field
    expect(parseScreen({ movesN: 12, colorChoice: 'white', elo: 1500, settings: { movesN: 12, elo: 1500 }, ucis: [] })).toBeUndefined();
  });

  it('rejects an illegal move list as a whole', () => {
    const badScreen = { movesN: 12, colorChoice: 'white', elo: 1500, settings: { movesN: 12, playerColor: 'white', elo: 1500 }, ucis: ['e2e4', 'd2d4'] };
    expect(parseScreen(badScreen)).toBeUndefined();
  });

  it('rejects a move list longer than the round\'s move cap', () => {
    // A repeating knight shuffle (g1f3/g8f6/f3g1/f6g8) returns to the start position, White to
    // move, every 4 plies — 6 full cycles (24 plies) plus one more move gives 25 legal plies,
    // one over movesN 12's cap of 2*12=24.
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const ucis = [...Array(6).fill(cycle).flat(), 'g1f3'];
    const screen = { movesN: 12, colorChoice: 'white', elo: 1500, settings: { movesN: 12, playerColor: 'white', elo: 1500 }, ucis };
    expect(parseScreen(screen)).toBeUndefined();
  });

  it('rejects a movesN or elo outside the offered range, top-level or in settings', () => {
    expect(parseScreen({ ...defaultScreen(12, 1500), movesN: 13 })).toBeUndefined(); // not a preset
    expect(parseScreen({ ...defaultScreen(12, 1500), elo: 50 })).toBeUndefined(); // below MIN_UCI_ELO
    expect(parseScreen({ ...defaultScreen(12, 1500), elo: 9999 })).toBeUndefined(); // above MAX_UCI_ELO
    expect(
      parseScreen({ movesN: 12, colorChoice: 'white', elo: 1500, settings: { movesN: 13, playerColor: 'white', elo: 1500 }, ucis: [] }),
    ).toBeUndefined();
  });
});
