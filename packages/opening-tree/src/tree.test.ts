import { describe, expect, it } from 'vitest';
import { importPgn } from '@human-chess/import';
import type { ImportedGame } from '@human-chess/import';
import { buildGamesTree, childrenOf, fenAt, mostPlayed, moveScore, START_FEN } from './tree';

/** A hand-written PGN, imported the same way a pasted-PGN ImportedGame would be (importPgn
 * never sets `username`/`playedAs` — the tree has to recompute "did this player play this
 * colour" itself from the White/Black headers, which is exactly what this suite is checking). */
function pgn(white: string, black: string, result: string, moves: string): ImportedGame {
  return importPgn(`[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`);
}

describe('buildGamesTree', () => {
  it('folds only the games where the named player played the given colour', () => {
    const games = [
      pgn('nadavk', 'opp1', '1-0', '1. e4 e5'), // nadavk as white: folded
      pgn('opp2', 'nadavk', '0-1', '1. d4 d5'), // nadavk as black: skipped (looking for white)
      pgn('someoneElse', 'opp3', '1-0', '1. c4 c5'), // not nadavk at all: skipped
    ];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    expect(tree.gamesFolded).toBe(1);
    expect(tree.gamesSkipped).toBe(2);
    expect(childrenOf(tree, tree.root).map(m => m.san)).toEqual(['e4']);
  });

  it('matches the username case-insensitively, same rule as ImportedGame.playedAs', () => {
    const games = [pgn('NadavK', 'opp', '1-0', '1. e4 e5')];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    expect(tree.gamesFolded).toBe(1);
  });

  it('skips a game with no decisive result without throwing', () => {
    const games = [pgn('nadavk', 'opp', '*', '1. e4 e5')];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    expect(tree.gamesFolded).toBe(0);
    expect(tree.gamesSkipped).toBe(1);
    expect(childrenOf(tree, tree.root)).toEqual([]);
  });

  it('merges transpositions: two different move orders reaching the same position share the deeper node', () => {
    // No pawn moves at all (Nf3/Nc6/Nc3 only), so there's no en-passant-square subtlety to
    // worry about — both orders reach the exact same position after 2 plies each side.
    const games = [
      pgn('nadavk', 'opp1', '1-0', '1. Nf3 Nc6 2. Nc3'),
      pgn('nadavk', 'opp2', '0-1', '1. Nc3 Nc6 2. Nf3'),
    ];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const afterNf3 = childrenOf(tree, tree.root).find(m => m.san === 'Nf3')!;
    const afterNc3 = childrenOf(tree, tree.root).find(m => m.san === 'Nc3')!;
    expect(afterNf3.count).toBe(1);
    expect(afterNc3.count).toBe(1);
    // Nf3 Nc6 Nc3 (game 1's line) and Nc3 Nc6 Nf3 (game 2's line) land on the same EPD.
    const viaNf3First = childrenOf(tree, afterNf3.to).find(m => m.san === 'Nc6')!;
    const viaNc3First = childrenOf(tree, afterNc3.to).find(m => m.san === 'Nc6')!;
    const nodeAfterNf3Nc6 = childrenOf(tree, viaNf3First.to).find(m => m.san === 'Nc3')!;
    const nodeAfterNc3Nc6 = childrenOf(tree, viaNc3First.to).find(m => m.san === 'Nf3')!;
    expect(nodeAfterNf3Nc6.to).toBe(nodeAfterNc3Nc6.to);
  });

  it('caps folded depth at 2 * maxPliesPerSide plies, truncating a longer game', () => {
    const games = [pgn('nadavk', 'opp', '1-0', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6')];
    const tree = buildGamesTree(games, 'nadavk', 'white', { maxPliesPerSide: 1 });
    // 2 * 1 = 2 plies folded: e4, e5. Nf3 (ply 3) never gets its own node from the root.
    const afterE4 = childrenOf(tree, tree.root).find(m => m.san === 'e4')!;
    const afterE5 = childrenOf(tree, afterE4.to).find(m => m.san === 'e5')!;
    expect(childrenOf(tree, afterE5.to)).toEqual([]);
  });

  it('counts wins/draws/losses from the tracked player\'s own side, not White/Black literally', () => {
    const games = [
      pgn('opp', 'nadavk', '0-1', '1. e4 e5'), // nadavk (black) won
      pgn('opp', 'nadavk', '1-0', '1. e4 e5'), // nadavk (black) lost
      pgn('opp', 'nadavk', '1/2-1/2', '1. e4 e5'), // draw
    ];
    const tree = buildGamesTree(games, 'nadavk', 'black');
    const afterE4 = childrenOf(tree, tree.root).find(m => m.san === 'e4')!;
    expect(afterE4.count).toBe(3);
    expect(afterE4.results).toEqual({ wins: 1, losses: 1, draws: 1 });
    expect(moveScore(afterE4)).toBeCloseTo(0.5);
  });

  it('records a traceable GameRef per move, from the url/playedAt/opponent on the ImportedGame', () => {
    const game = importPgn(
      '[White "nadavk"]\n[Black "opp"]\n[Result "1-0"]\n[Site "https://lichess.org/abcd1234"]\n[UTCDate "2026.03.10"]\n[UTCTime "18:00:00"]\n\n1. e4 e5 1-0',
    );
    const tree = buildGamesTree([game], 'nadavk', 'white');
    const afterE4 = childrenOf(tree, tree.root).find(m => m.san === 'e4')!;
    expect(afterE4.games).toEqual([{ url: 'https://lichess.org/abcd1234', playedAt: '2026-03-10T18:00:00Z', opponent: 'opp' }]);
  });

  it('skips a "From Position" game rather than folding its moves from START_FEN (B1)', () => {
    // A real shape lichess/chess.com PGNs can carry: [Variant "From Position"] plus a [FEN]
    // header that isn't the standard start. parsePgnGame accepts it fine (From Position is a
    // supported variant per packages/rules/src/pgn.ts) — this tree just isn't built to fold it,
    // since it has exactly one root, the standard starting position. Folding its ucis from
    // START_FEN anyway would either desync silently or throw partway through a useMemo during
    // render (which is what actually happened before this fix: it blanked the whole route).
    const game = importPgn(
      [
        '[White "nadavk"]',
        '[Black "opp"]',
        '[Result "1-0"]',
        '[Variant "From Position"]',
        '[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]',
        '',
        '1...Nc6 2. Nf3 1-0',
      ].join('\n'),
    );
    const tree = buildGamesTree([game], 'nadavk', 'white');
    expect(tree.gamesFolded).toBe(0);
    expect(tree.gamesSkipped).toBe(1);
    expect(childrenOf(tree, tree.root)).toEqual([]);
  });

  it('is grounded at the standard start position', () => {
    const tree = buildGamesTree([], 'nadavk', 'white');
    expect(fenAt(tree.root)).toBe(START_FEN);
    expect(tree.gamesFolded).toBe(0);
    expect(tree.gamesSkipped).toBe(0);
  });
});

describe('mostPlayed', () => {
  it('orders moves by count, descending', () => {
    const games = [
      pgn('nadavk', 'a', '1-0', '1. e4'),
      pgn('nadavk', 'b', '1-0', '1. d4'),
      pgn('nadavk', 'c', '1-0', '1. d4'),
    ];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const ordered = mostPlayed(childrenOf(tree, tree.root));
    expect(ordered.map(m => m.san)).toEqual(['d4', 'e4']);
  });
});

describe('moveScore', () => {
  it('is 0 for a move with no games (defensive default, not NaN)', () => {
    expect(moveScore({ uci: 'e2e4', san: 'e4', to: 'x', count: 0, results: { wins: 0, draws: 0, losses: 0 }, games: [] })).toBe(0);
  });
});
