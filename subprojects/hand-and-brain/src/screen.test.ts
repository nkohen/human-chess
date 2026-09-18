import { describe, expect, it } from 'vitest';
import { call, move, startGame } from './game';
import { defaultScreen, parseScreen, replayGame, type Screen } from './screen';

describe('hand-and-brain screen snapshot', () => {
  it('round-trips a fresh game', () => {
    const screen = defaultScreen();
    const parsed = parseScreen(JSON.parse(JSON.stringify(screen)));
    expect(parsed).toEqual(screen);
    expect(replayGame(parsed!).moves).toEqual([]);
  });

  it('round-trips a game with moves played and no pending call', () => {
    let g = startGame();
    g = move(call(g, 'pawn'), 'e2', 'e4');
    g = move(call(g, 'knight'), 'b8', 'c6');
    const screen: Screen = { ucis: g.moves.map(m => m.uci), calledRole: undefined };
    const parsed = parseScreen(JSON.parse(JSON.stringify(screen)));
    expect(parsed).toEqual(screen);
    const replayed = replayGame(parsed!);
    expect(replayed.moves.map(m => m.uci)).toEqual(['e2e4', 'b8c6']);
    expect(replayed.calledRole).toBeUndefined();
  });

  it('round-trips the mid-turn phase: brain has called, hand has not moved', () => {
    let g = startGame();
    g = move(call(g, 'pawn'), 'e2', 'e4');
    g = call(g, 'knight');
    const screen: Screen = { ucis: g.moves.map(m => m.uci), calledRole: g.calledRole };
    const parsed = parseScreen(JSON.parse(JSON.stringify(screen)));
    expect(parsed).toEqual(screen);
    const replayed = replayGame(parsed!);
    expect(replayed.calledRole).toBe('knight');
    expect(replayed.moves).toHaveLength(1);
  });

  it('round-trips a promotion move', () => {
    // A real (legal, played move-by-move) pawn race: White's a-pawn and Black's h-pawn both
    // run down the board, each capturing once, until White's captures Black's rook on a8 and
    // promotes — every move here is a pawn move, so the brain calls "pawn" throughout.
    const ucis = ['a2a4', 'h7h5', 'a4a5', 'h5h4', 'a5a6', 'h4h3', 'a6b7', 'h3g2', 'b7a8q'];
    let g = startGame();
    for (const uci of ucis) {
      const from = uci.slice(0, 2) as Parameters<typeof move>[1];
      const to = uci.slice(2, 4) as Parameters<typeof move>[2];
      const promotion = uci.length > 4 ? ('queen' as const) : undefined;
      g = promotion ? move(call(g, 'pawn'), from, to, promotion) : move(call(g, 'pawn'), from, to);
    }
    const screen: Screen = { ucis: g.moves.map(m => m.uci), calledRole: undefined };
    expect(screen.ucis).toEqual(ucis);
    const parsed = parseScreen(JSON.parse(JSON.stringify(screen)));
    expect(parsed).toBeDefined();
    const replayed = replayGame(parsed!);
    expect(replayed.moves[replayed.moves.length - 1]!.uci).toBe('b7a8q');
  });

  it('rejects a stale/corrupt shape', () => {
    expect(parseScreen(undefined)).toBeUndefined();
    expect(parseScreen(null)).toBeUndefined();
    expect(parseScreen({})).toBeUndefined();
    expect(parseScreen({ ucis: 'e2e4' })).toBeUndefined();
    expect(parseScreen({ ucis: [1, 2] })).toBeUndefined();
    expect(parseScreen({ ucis: [], calledRole: 'dragon' })).toBeUndefined();
  });

  it('rejects an illegal move list as a whole, not just the bad move', () => {
    // e2e4 is legal, but e7e5 as White-to-move-again is not — the whole snapshot is rejected,
    // not just the second move (never half-restored).
    expect(parseScreen({ ucis: ['e2e4', 'd2d4'], calledRole: undefined })).toBeUndefined();
    expect(parseScreen({ ucis: ['e2e4'], calledRole: 'king' })).toBeUndefined(); // no legal king move
  });
});
