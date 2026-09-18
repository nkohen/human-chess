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
    const ucis = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']; // 5 plies, cap is 2*2=4
    const screen = { movesN: 2, colorChoice: 'white', elo: 1500, settings: { movesN: 2, playerColor: 'white', elo: 1500 }, ucis };
    expect(parseScreen(screen)).toBeUndefined();
  });
});
