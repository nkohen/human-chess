import { describe, expect, it } from 'vitest';
import { parsePgnGame, parsePgnGames, RulesError } from './index';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('parsePgnGame', () => {
  it('parses headers, moves, comments and skips variations', () => {
    const pgn = `[Event "Test"]
[Site "?"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 {best by test} e5 (1... c5 2. Nf3) 2. Nf3 Nc6 3. Bb5 1-0`;

    const game = parsePgnGame(pgn);
    expect(game.headers.White).toBe('A');
    expect(game.headers.Black).toBe('B');
    expect(game.headers.Result).toBe('1-0');
    expect(game.startFen).toBe(START_FEN);
    expect(game.ucis).toEqual(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']);
    expect(game.sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  });

  it('starts from the FEN header when one is given', () => {
    const pgn = `[FEN "4k3/8/8/8/8/8/8/4K2R w K - 0 1"]

1. Ke2 *`;

    const game = parsePgnGame(pgn);
    expect(game.startFen).toBe('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    expect(game.ucis).toEqual(['e1e2']);
    expect(game.sans).toEqual(['Ke2']);
  });

  it('throws RulesError naming the move number for an unparseable move', () => {
    const pgn = '1. e4 e5 2. Nf6 *';
    expect(() => parsePgnGame(pgn)).toThrow(RulesError);
    expect(() => parsePgnGame(pgn)).toThrow(/move 2/);
  });

  it('names the move number from a FEN start where Black moves first', () => {
    const pgn = `[FEN "4k3/8/8/8/8/8/4P3/4K3 b - - 0 5"]

5... Kd8 6. e4 Nf6 *`;
    // Ply 1 = Black's 5...Kd8, ply 2 = White's 6.e4, ply 3 = Black's unparseable "Nf6"
    // (no knight on the board) — that is move 6 (Black), not move 2 as ceil(ply/2) would say.
    expect(() => parsePgnGame(pgn)).toThrow(/move 6/);
  });

  it('rejects a Variant header outside Standard/Chess960/From Position', () => {
    const pgn = `[Variant "Crazyhouse"]

1. e4 e5 *`;
    expect(() => parsePgnGame(pgn)).toThrow(RulesError);
    expect(() => parsePgnGame(pgn)).toThrow(/[Cc]razyhouse/);
  });
});

describe('parsePgnGames', () => {
  it('parses every game in a multi-game PGN (lichess export format), each with its own reconstructed pgn text', () => {
    const pgn = `[Event "Game 1"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0

[Event "Game 2"]
[White "C"]
[Black "D"]
[Result "0-1"]

1. d4 d5 0-1
`;
    const { games, skipped } = parsePgnGames(pgn);
    expect(games).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(games[0]!.headers.White).toBe('A');
    expect(games[0]!.ucis).toEqual(['e2e4', 'e7e5', 'g1f3']);
    expect(games[1]!.headers.White).toBe('C');
    expect(games[1]!.ucis).toEqual(['d2d4', 'd7d5']);

    // Each game's own `pgn` text round-trips through parsePgnGame to the same moves.
    expect(games[0]!.pgn).toBeDefined();
    expect(parsePgnGame(games[0]!.pgn!).ucis).toEqual(games[0]!.ucis);
    expect(parsePgnGame(games[1]!.pgn!).ucis).toEqual(games[1]!.ucis);
  });

  it('returns an empty result for text with no games, and does not set pgn on parsePgnGame', () => {
    expect(parsePgnGames('')).toEqual({ games: [], skipped: 0 });
    expect(parsePgnGame('1. e4 e5 *').pgn).toBeUndefined();
  });

  it('skips one malformed game without discarding the good games around it (M1)', () => {
    const pgn = `[Event "Game 1"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0

[Event "Game 2 (illegal move)"]
[White "C"]
[Black "D"]
[Result "0-1"]

1. e4 e5 2. Nf6 0-1

[Event "Game 3"]
[White "E"]
[Black "F"]
[Result "1/2-1/2"]

1. d4 d5 1/2-1/2
`;
    const { games, skipped } = parsePgnGames(pgn);
    expect(games).toHaveLength(2);
    expect(skipped).toBe(1);
    expect(games[0]!.headers.White).toBe('A');
    expect(games[1]!.headers.White).toBe('E');
  });
});
