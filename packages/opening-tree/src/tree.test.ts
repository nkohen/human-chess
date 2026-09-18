import { describe, expect, it } from 'vitest';
import { importPgn } from '@human-chess/import';
import type { ImportedGame } from '@human-chess/import';
import { buildGamesTree, buildTree, childrenOf, fenAt, lineTo, mostPlayed, moveScore, START_FEN } from './tree';

/** A hand-written PGN, imported the same way a pasted-PGN ImportedGame would be (importPgn never
 * sets `username`/`playedAs`, and never populates `.meta` at all yet — commit 8cc01ba added the
 * `meta` contract but left filling it in to the fetchers, so tests that need meta fields set
 * them via `extra`). */
function pgn(white: string, black: string, result: string, moves: string, extra: Partial<ImportedGame> = {}): ImportedGame {
  const game = importPgn(`[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`);
  return { ...game, ...extra };
}

describe('buildGamesTree (v1 compatibility surface)', () => {
  it('folds only the games where the named player played the given colour', () => {
    const games = [
      pgn('nadavk', 'opp1', '1-0', '1. e4 e5'),
      pgn('opp2', 'nadavk', '0-1', '1. d4 d5'),
      pgn('someoneElse', 'opp3', '1-0', '1. c4 c5'),
    ];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    expect(tree.gamesFolded).toBe(1);
    expect(tree.gamesSkipped).toBe(2);
    expect(childrenOf(tree, tree.root).map(m => m.san)).toEqual(['e4']);
  });

  it('matches the username case-insensitively', () => {
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

  it('merges transpositions: two move orders reaching the same position share the deeper node', () => {
    const games = [
      pgn('nadavk', 'opp1', '1-0', '1. Nf3 Nc6 2. Nc3'),
      pgn('nadavk', 'opp2', '0-1', '1. Nc3 Nc6 2. Nf3'),
    ];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const afterNf3 = childrenOf(tree, tree.root).find(m => m.san === 'Nf3')!;
    const afterNc3 = childrenOf(tree, tree.root).find(m => m.san === 'Nc3')!;
    expect(afterNf3.count).toBe(1);
    expect(afterNc3.count).toBe(1);
    const viaNf3First = childrenOf(tree, afterNf3.to).find(m => m.san === 'Nc6')!;
    const viaNc3First = childrenOf(tree, afterNc3.to).find(m => m.san === 'Nc6')!;
    const nodeAfterNf3Nc6 = childrenOf(tree, viaNf3First.to).find(m => m.san === 'Nc3')!;
    const nodeAfterNc3Nc6 = childrenOf(tree, viaNc3First.to).find(m => m.san === 'Nf3')!;
    expect(nodeAfterNf3Nc6.to).toBe(nodeAfterNc3Nc6.to);
    // The converged node was reached from two distinct predecessor EPDs -> a transposition.
    expect(tree.nodes.get(nodeAfterNf3Nc6.to)!.parents).toBe(2);
  });

  it('caps folded depth at 2 * maxPliesPerSide plies, truncating a longer game', () => {
    const games = [pgn('nadavk', 'opp', '1-0', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6')];
    const tree = buildGamesTree(games, 'nadavk', 'white', { maxPliesPerSide: 1 });
    const afterE4 = childrenOf(tree, tree.root).find(m => m.san === 'e4')!;
    const afterE5 = childrenOf(tree, afterE4.to).find(m => m.san === 'e5')!;
    expect(childrenOf(tree, afterE5.to)).toEqual([]);
  });

  it("counts wins/draws/losses from the tracked player's own side, not White/Black literally", () => {
    const games = [
      pgn('opp', 'nadavk', '0-1', '1. e4 e5'),
      pgn('opp', 'nadavk', '1-0', '1. e4 e5'),
      pgn('opp', 'nadavk', '1/2-1/2', '1. e4 e5'),
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
    expect(afterE4.games).toEqual([
      { url: 'https://lichess.org/abcd1234', playedAt: '2026-03-10T18:00:00Z', opponent: 'opp', gameIndex: 0 },
    ]);
    expect(tree.games[0]).toMatchObject({ index: 0, url: 'https://lichess.org/abcd1234', opponent: 'opp', source: 'lichess' });
  });

  it('skips a "From Position" game rather than folding its moves from START_FEN', () => {
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
    expect(tree.skipped.unparsable).toBe(1);
    expect(childrenOf(tree, tree.root)).toEqual([]);
  });

  it('is grounded at the standard start position', () => {
    const tree = buildGamesTree([], 'nadavk', 'white');
    expect(fenAt(tree.root)).toBe(START_FEN);
    expect(tree.gamesFolded).toBe(0);
    expect(tree.gamesSkipped).toBe(0);
  });
});

describe('buildTree', () => {
  it('matches any of several listed accounts, and buckets each skip reason', () => {
    const games = [
      pgn('nadavk', 'opp1', '1-0', '1. e4 e5'), // matches lichess username
      pgn('nadav_cc', 'opp2', '1-0', '1. d4 d5'), // matches chess.com username
      pgn('opp3', 'nadavk', '0-1', '1. c4 c5'), // right player, wrong colour
      pgn('nadavk', 'opp4', '*', '1. Nf3 Nf6'), // right player/colour, undecided result
      pgn('stranger', 'opp5', '1-0', '1. e4 e5'), // not the tracked player at all
    ];
    const tree = buildTree(games, {
      players: [
        { site: 'lichess', username: 'nadavk' },
        { site: 'chess.com', username: 'nadav_cc' },
      ],
      color: 'white',
    });
    expect(tree.gamesFolded).toBe(2);
    expect(tree.skipped).toEqual({ notPlayer: 1, wrongColor: 1, selfPlay: 0, undecided: 1, unparsable: 0, filteredOut: 0 });
    expect(tree.gamesSkipped).toBe(3);
  });

  it('skips a zero-move game as unparsable rather than folding an empty game', () => {
    const games = [pgn('nadavk', 'opp', '1-0', '')];
    expect(games[0]!.ucis).toEqual([]);
    const tree = buildTree(games, { players: [{ site: 'lichess', username: 'nadavk' }], color: 'white' });
    expect(tree.gamesFolded).toBe(0);
    expect(tree.skipped.unparsable).toBe(1);
  });

  it("doesn't double-count a game that repeats a position via the same edge", () => {
    // 1.Nf3 Nf6 2.Ng1 Ng8 returns to the exact starting position (both knights home again), then
    // 3.Nf3 replays the very same root->Nf3 edge a second time within this one game.
    const games = [pgn('nadavk', 'opp', '1-0', '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6')];
    const tree = buildTree(games, { players: [{ site: 'lichess', username: 'nadavk' }], color: 'white' });
    expect(tree.gamesFolded).toBe(1);
    const root = tree.nodes.get(tree.root)!;
    expect(root.games).toBe(1);
    expect(root.parents).toBe(0);
    const nf3 = root.moves.find(m => m.san === 'Nf3')!;
    expect(nf3.count).toBe(1);
    expect(nf3.games).toHaveLength(1);
  });

  it("restricts header-matching to the game's own site, so a same-named stranger on a different site isn't folded as the tracked player", () => {
    // 'nadavk' here is an unrelated stranger who happens to share the lichess-tracked username;
    // the actual tracked player on chess.com is 'nadav_cc'. Without a site-aware fallback this
    // chess.com game's White header ('nadavk') would wrongly match the lichess-listed player.
    const game = pgn('nadavk', 'nadav_cc', '1-0', '1. e4 e5', { url: 'https://www.chess.com/game/live/1' });
    const players = [
      { site: 'lichess' as const, username: 'nadavk' },
      { site: 'chess.com' as const, username: 'nadav_cc' },
    ];
    const whiteTree = buildTree([game], { players, color: 'white' });
    expect(whiteTree.gamesFolded).toBe(0);
    expect(whiteTree.skipped.wrongColor).toBe(1); // it's nadav_cc's (black's) game, not nadavk's
    const blackTree = buildTree([game], { players, color: 'black' });
    expect(blackTree.gamesFolded).toBe(1);
    expect(blackTree.games[0]!.result).toBe('loss'); // nadav_cc played black and lost (1-0)
  });

  it('prefers the fetcher-set username/playedAs over header matching when present', () => {
    // Headers alone would say White ('nadavk') is the tracked player, but the fetcher recorded
    // this as fetched under 'nadavk' having played black — trust that over the headers.
    const game = pgn('nadavk', 'someone', '1-0', '1. e4 e5', { username: 'nadavk', playedAs: 'black' });
    const tree = buildTree([game], { players: [{ site: 'lichess', username: 'nadavk' }], color: 'black' });
    expect(tree.gamesFolded).toBe(1);
    expect(tree.games[0]!.result).toBe('loss');
  });

  it('counts a game between two listed accounts as selfPlay, not a fold for either', () => {
    const game = pgn('nadavk', 'nadav_cc', '1-0', '1. e4 e5');
    const players = [
      { site: 'lichess' as const, username: 'nadavk' },
      { site: 'chess.com' as const, username: 'nadav_cc' },
    ];
    const tree = buildTree([game], { players, color: 'white' });
    expect(tree.gamesFolded).toBe(0);
    expect(tree.skipped.selfPlay).toBe(1);
  });

  it('derives TrackedGame.source from the URL host, not from ImportedGame.source', () => {
    const game = pgn('nadavk', 'opp', '1-0', '1. e4 e5', { url: 'https://lichess.org/abcd1234' });
    expect(game.source).toBe('pgn'); // importPgn always tags 'pgn', regardless of URL content
    const ccGame = pgn('nadavk', 'opp2', '1-0', '1. d4 d5', { url: 'https://www.chess.com/game/live/1' });
    const noUrlGame = pgn('nadavk', 'opp3', '1-0', '1. c4 c5');
    // 'nadavk' is listed under both sites here since this test plays it on both (chess.com's own
    // header-matching is site-restricted — see "restricts header-matching to the game's own
    // site" below — a player only listed under 'lichess' wouldn't match a chess.com-sourced game).
    const players = [
      { site: 'lichess' as const, username: 'nadavk' },
      { site: 'chess.com' as const, username: 'nadavk' },
    ];
    const tree = buildTree([game, ccGame, noUrlGame], { players, color: 'white' });
    const bySource = new Map(tree.games.map(g => [g.opponent, g.source]));
    expect(bySource.get('opp')).toBe('lichess');
    expect(bySource.get('opp2')).toBe('chess.com');
    expect(bySource.get('opp3')).toBe('pgn');
  });

  it('carries meta (rating, speed, rated, eco, openingName) from ImportedGame.meta onto TrackedGame', () => {
    const game = pgn('nadavk', 'opp', '1-0', '1. e4 e5', {
      meta: { speed: 'blitz', rated: true, whiteElo: 1500, blackElo: 1600, eco: 'C50', openingName: 'Italian Game' },
    });
    const tree = buildTree([game], { players: [{ site: 'lichess', username: 'nadavk' }], color: 'white' });
    expect(tree.games[0]).toMatchObject({
      opponentRating: 1600, // black's elo, since the tracked side is white
      speed: 'blitz',
      rated: true,
      eco: 'C50',
      openingName: 'Italian Game',
    });
  });

  it('computes score/avgOpponentRating/performance/lastPlayedAt per edge from the folded games', () => {
    const games = [
      pgn('nadavk', 'opp1', '1-0', '1. e4 e5', { meta: { blackElo: 1500 }, playedAt: '2026-01-01T00:00:00Z' }),
      pgn('nadavk', 'opp2', '0-1', '1. e4 e5', { meta: { blackElo: 1700 }, playedAt: '2026-03-01T00:00:00Z' }),
      pgn('nadavk', 'opp3', '1-0', '1. e4 e5'), // no rating meta at all
    ];
    const tree = buildTree(games, { players: [{ site: 'lichess', username: 'nadavk' }], color: 'white' });
    const afterE4 = childrenOf(tree, tree.root).find(m => m.san === 'e4')!;
    expect(afterE4.count).toBe(3);
    expect(afterE4.score).toBeCloseTo(2 / 3);
    // Perf/avg-rating only over the two rated-opponent games: avg (1500+1700)/2 = 1600,
    // 1 win + 1 loss among those two -> +400*(1-1)/2 = +0.
    expect(afterE4.avgOpponentRating).toBe(1600);
    expect(afterE4.performance).toBe(1600);
    expect(afterE4.lastPlayedAt).toBe('2026-03-01T00:00:00Z');
  });

  it('excludes a game from opts.filter before folding, counted as filteredOut', () => {
    const games = [
      pgn('nadavk', 'opp1', '1-0', '1. e4 e5', { meta: { speed: 'blitz' } }),
      pgn('nadavk', 'opp2', '1-0', '1. d4 d5', { meta: { speed: 'bullet' } }),
    ];
    const tree = buildTree(games, {
      players: [{ site: 'lichess', username: 'nadavk' }],
      color: 'white',
      filter: { speeds: ['blitz'] },
    });
    expect(tree.gamesFolded).toBe(1);
    expect(tree.skipped.filteredOut).toBe(1);
    expect(childrenOf(tree, tree.root).map(m => m.san)).toEqual(['e4']);
  });

  it('is grounded at the standard start position with an empty tree.games/nodes otherwise', () => {
    const tree = buildTree([], { players: [{ site: 'lichess', username: 'nadavk' }], color: 'white' });
    expect(fenAt(tree.root)).toBe(START_FEN);
    expect(tree.games).toEqual([]);
    expect(tree.nodes.get(tree.root)).toMatchObject({ epd: tree.root, games: 0, moves: [], parents: 0 });
  });
});

describe('lineTo', () => {
  it('returns [] for the root, and the SAN path for a deeper node', () => {
    const games = [pgn('nadavk', 'opp', '1-0', '1. e4 e5 2. Nf3 Nc6')];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    expect(lineTo(tree, tree.root)).toEqual([]);
    const afterE4 = childrenOf(tree, tree.root).find(m => m.san === 'e4')!;
    const afterE5 = childrenOf(tree, afterE4.to).find(m => m.san === 'e5')!;
    const afterNf3 = childrenOf(tree, afterE5.to).find(m => m.san === 'Nf3')!;
    expect(lineTo(tree, afterNf3.to)).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('returns [] for an EPD the tree never reached', () => {
    const tree = buildGamesTree([], 'nadavk', 'white');
    expect(lineTo(tree, 'not-a-real-epd')).toEqual([]);
  });
});

describe('mostPlayed', () => {
  it('orders moves by count, descending', () => {
    const games = [pgn('nadavk', 'a', '1-0', '1. e4'), pgn('nadavk', 'b', '1-0', '1. d4'), pgn('nadavk', 'c', '1-0', '1. d4')];
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const ordered = mostPlayed(childrenOf(tree, tree.root));
    expect(ordered.map(m => m.san)).toEqual(['d4', 'e4']);
  });
});

describe('moveScore', () => {
  it('is 0 for a move with no games (defensive default, not NaN)', () => {
    expect(moveScore({ uci: 'e2e4', san: 'e4', to: 'x', count: 0, results: { wins: 0, draws: 0, losses: 0 }, score: 0, games: [] })).toBe(0);
  });
});

describe('performance: folding thousands of games stays fast', () => {
  it('folds 2000 games (a handful of templates repeated with varied headers) well under a second', () => {
    const templates = [
      '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6',
      '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7',
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6',
      '1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6',
      '1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5',
    ];
    const results = ['1-0', '0-1', '1/2-1/2'];
    const games: ImportedGame[] = [];
    for (let i = 0; i < 2000; i++) {
      const moves = templates[i % templates.length]!;
      const result = results[i % results.length]!;
      games.push(pgn('nadavk', `opp${i}`, result, moves, { playedAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z` }));
    }
    const start = performance.now();
    const tree = buildGamesTree(games, 'nadavk', 'white');
    const elapsedMs = performance.now() - start;
    expect(tree.gamesFolded).toBe(2000);
    // Structural assertion (the actual "did the Map-based rewrite work" check) plus a very loose
    // smoke bound on wall-clock time — generous enough not to flake on a loaded CI box, not tight
    // enough to be a real perf regression gate.
    expect(elapsedMs).toBeLessThan(10000);
  });
});
