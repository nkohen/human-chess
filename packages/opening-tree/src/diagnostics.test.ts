import { describe, expect, it } from 'vitest';
import { importPgn } from '@human-chess/import';
import type { ImportedGame } from '@human-chess/import';
import { mostLostPositions, openingSummary, worstMoves } from './diagnostics';
import { buildGamesTree } from './tree';

function pgn(white: string, black: string, result: string, moves: string, extra: Partial<ImportedGame> = {}): ImportedGame {
  const game = importPgn(`[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`);
  return { ...game, ...extra };
}

describe('worstMoves', () => {
  it("ranks the tracked player's own moves by lowest score, ignoring the opponent's replies", () => {
    const games = [
      // 1. e4: 1 win, 3 losses -> score 0.25. 1. d4: 3 wins, 1 loss -> score 0.75.
      pgn('nadavk', 'a', '1-0', '1. e4'),
      pgn('nadavk', 'b', '0-1', '1. e4'),
      pgn('nadavk', 'c', '0-1', '1. e4'),
      pgn('nadavk', 'd', '0-1', '1. e4'),
      pgn('nadavk', 'e', '1-0', '1. d4'),
      pgn('nadavk', 'f', '1-0', '1. d4'),
      pgn('nadavk', 'g', '1-0', '1. d4'),
      pgn('nadavk', 'h', '0-1', '1. d4'),
    ];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const worst = worstMoves(tree, { minGames: 4 });
    expect(worst[0]!.move.san).toBe('e4');
    expect(worst[0]!.line).toEqual([]); // the move is available at the root itself
    expect(worst.map(w => w.move.san)).toEqual(['e4', 'd4']);
  });

  it('excludes moves played fewer than minGames times', () => {
    const games = [pgn('nadavk', 'a', '0-1', '1. h4')]; // one loss, but only 1 game
    const tree = buildGamesTree(games, 'nadavk', 'white');
    expect(worstMoves(tree, { minGames: 2 })).toEqual([]);
  });

  it('reports the SAN line to a deeper own-move node along the most-played path', () => {
    const games = [
      pgn('nadavk', 'a', '0-1', '1. e4 e5 2. Nf3'),
      pgn('nadavk', 'b', '0-1', '1. e4 e5 2. Nf3'),
    ];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const worst = worstMoves(tree, { minGames: 2 });
    const nf3 = worst.find(w => w.move.san === 'Nf3')!;
    expect(nf3.line).toEqual(['e4', 'e5']);
  });
});

describe('mostLostPositions', () => {
  it('ranks positions by loss count first, then loss rate (root and shallow nodes aggregate every game, so a 100%-losing branch outranks them once counts tie)', () => {
    const games = [
      // After 1. e4 e5: 3 losses out of 3 games reaching it (rate 1.0).
      pgn('nadavk', 'a', '0-1', '1. e4 e5'),
      pgn('nadavk', 'b', '0-1', '1. e4 e5'),
      pgn('nadavk', 'c', '0-1', '1. e4 e5'),
      // After 1. d4 d5: 0 losses out of 3 (all won).
      pgn('nadavk', 'd', '1-0', '1. d4 d5'),
      pgn('nadavk', 'e', '1-0', '1. d4 d5'),
      pgn('nadavk', 'f', '1-0', '1. d4 d5'),
    ];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const worst = mostLostPositions(tree, { minGames: 3 });
    // Root also has 3 losses (summed across all 6 games) but a lower rate (3/6 vs 3/3), so the
    // "after e4 e5" branch (and "after e4") outrank it on the loss-rate tiebreak.
    expect(worst[0]!.node.results.losses).toBe(3);
    expect(worst[0]!.node.games).toBe(3);
    expect(worst[0]!.line[0]).toBe('e4');
  });

  it('excludes positions reached fewer than minGames times', () => {
    const games = [pgn('nadavk', 'a', '0-1', '1. a4 a5')];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    expect(mostLostPositions(tree, { minGames: 2 })).toEqual([]);
  });

  it('minGames: 0 is clamped to 1, never producing a 0/0 NaN in the loss-rate tiebreak', () => {
    const games = [pgn('nadavk', 'a', '0-1', '1. a4 a5')];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const worst = mostLostPositions(tree, { minGames: 0 });
    expect(worst.every(e => Number.isFinite(e.node.games) && e.node.games > 0)).toBe(true);
    expect(worst.some(e => Number.isNaN(e.node.results.losses / e.node.games))).toBe(false);
  });
});

describe('openingSummary', () => {
  it('aggregates by opening name, falling back to ECO then Unknown, sorted by games played', () => {
    const games = [
      pgn('nadavk', 'a', '1-0', '1. e4 e5', { meta: { eco: 'C50', openingName: 'Italian Game' } }),
      pgn('nadavk', 'b', '0-1', '1. e4 e5', { meta: { eco: 'C50', openingName: 'Italian Game' } }),
      pgn('nadavk', 'c', '1/2-1/2', '1. d4 d5', { meta: { eco: 'D06' } }), // no openingName -> falls back to eco
      pgn('nadavk', 'd', '1-0', '1. Nf3 Nf6'), // no meta at all -> Unknown
    ];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const summary = openingSummary(tree);
    expect(summary[0]).toMatchObject({ name: 'Italian Game', eco: 'C50', games: 2, results: { wins: 1, draws: 0, losses: 1 }, score: 0.5 });
    expect(summary.find(s => s.name === 'D06')).toMatchObject({ games: 1, score: 0.5 });
    expect(summary.find(s => s.name === 'Unknown')).toMatchObject({ games: 1, score: 1 });
  });
});
