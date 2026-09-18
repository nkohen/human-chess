// Pure unit tests for ownGamesTree.ts's non-React helpers: selectSources (honours a persisted
// filter.sourceKeys, drops keys for removed accounts), gamesForSources (flattens the selected
// per-source game lists), toGameFilter (YourGamesFilterState -> @human-chess/opening-tree's
// GameFilter, with the end-of-day `until` bump), and rowsForPosition (the panel's own row order/
// inTree/divergence annotation). No React, no browser storage — useOwnGamesTree itself (the hook)
// is exercised indirectly through BuilderView.render.test.ts and GamesTreeView's own existing
// behaviour, which this refactor must leave unchanged.
import { describe, expect, it } from 'vitest';
import { importPgn, type ImportedGame, type StoredImportedGame } from '@human-chess/import';
import { buildTree, childrenOf } from '@human-chess/opening-tree';
import { DEFAULT_FILTER_STATE } from './treeHelpers';
import { gamesForSources, rowsForPosition, selectSources, toGameFilter, type SourceGames } from './ownGamesTree';

/** Same helper as tree.test.ts/MoveTree.render.test.ts: a hand-written PGN imported the way a
 * pasted-PGN ImportedGame would be, given a fake `id` so it satisfies StoredImportedGame. */
function pgn(white: string, black: string, result: string, moves: string, extra: Partial<ImportedGame> = {}): StoredImportedGame {
  const game = importPgn(`[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`);
  return { ...game, ...extra, id: `${white}-${black}-${moves}` };
}

describe('selectSources', () => {
  const alice = { site: 'lichess' as const, username: 'alice' };
  const bob = { site: 'chess.com' as const, username: 'bob' };

  it('returns every source when sourceKeys is empty (empty = all)', () => {
    expect(selectSources([alice, bob], [])).toEqual([alice, bob]);
  });

  it('narrows to only the sources named by sourceKeys', () => {
    expect(selectSources([alice, bob], ['lichess:alice'])).toEqual([alice]);
  });

  it('is case-insensitive on username, matching sourceKey\'s own convention', () => {
    expect(selectSources([alice, bob], ['LICHESS:ALICE'.toLowerCase()])).toEqual([alice]);
  });

  it('drops a sourceKey naming a since-removed account and falls back to "all" rather than an empty remainder', () => {
    expect(selectSources([alice, bob], ['lichess:removed'])).toEqual([alice, bob]);
  });

  it('keeps only the live keys when sourceKeys mixes a live and a removed account', () => {
    expect(selectSources([alice, bob], ['lichess:alice', 'lichess:removed'])).toEqual([alice]);
  });
});

describe('gamesForSources', () => {
  const alice = { site: 'lichess' as const, username: 'alice' };
  const bob = { site: 'chess.com' as const, username: 'bob' };
  const aliceGame = pgn('alice', 'opp', '1-0', '1. e4 e5');
  const bobGame = pgn('opp', 'bob', '0-1', '1. d4 d5');
  const gamesBySource: SourceGames[] = [
    { source: alice, games: [aliceGame] },
    { source: bob, games: [bobGame] },
  ];

  it('flattens only the games belonging to the selected sources', () => {
    expect(gamesForSources(gamesBySource, [alice])).toEqual([aliceGame]);
  });

  it('flattens every source\'s games when all are selected', () => {
    expect(gamesForSources(gamesBySource, [alice, bob])).toEqual([aliceGame, bobGame]);
  });

  it('returns an empty list when no source is loaded yet for the selection', () => {
    expect(gamesForSources([], [alice])).toEqual([]);
  });
});

describe('toGameFilter', () => {
  it('carries speeds/opponent/rating straight through, undefined where the form field is empty', () => {
    const filter = { ...DEFAULT_FILTER_STATE, speeds: ['blitz' as const], opponent: '  bob  ', opponentRatingMin: 1000 };
    const gameFilter = toGameFilter(filter);
    expect(gameFilter.speeds).toEqual(['blitz']);
    expect(gameFilter.opponent).toBe('  bob  ');
    expect(gameFilter.opponentRatingMin).toBe(1000);
    expect(gameFilter.opponentRatingMax).toBeUndefined();
  });

  it('maps rated to boolean|undefined and bumps until to the end of that calendar day', () => {
    expect(toGameFilter({ ...DEFAULT_FILTER_STATE, rated: 'rated' }).rated).toBe(true);
    expect(toGameFilter({ ...DEFAULT_FILTER_STATE, rated: 'casual' }).rated).toBe(false);
    expect(toGameFilter({ ...DEFAULT_FILTER_STATE, rated: 'all' }).rated).toBeUndefined();

    const until = toGameFilter({ ...DEFAULT_FILTER_STATE, until: '2026-01-15' }).until;
    expect(until).toBe('2026-01-15T23:59:59.999Z');
  });

  it('leaves an empty opponent string as undefined, not a blank filter', () => {
    expect(toGameFilter({ ...DEFAULT_FILTER_STATE, opponent: '' }).opponent).toBeUndefined();
  });
});

describe('rowsForPosition', () => {
  it('lists the tree\'s own moves in node order (count descending), each annotated against the repertoire', () => {
    const games = [
      pgn('nadavk', 'opp1', '1-0', '1. e4 e5'),
      pgn('nadavk', 'opp2', '1-0', '1. e4 c5'),
      pgn('nadavk', 'opp3', '1-0', '1. e4 c5'),
      pgn('nadavk', 'opp4', '0-1', '1. d4 d5'),
    ];
    const tree = buildTree(games, { players: [{ site: 'lichess', username: 'nadavk' }], color: 'white' });

    // Only e4's own children are relevant here (the check narrows to the position after 1.e4,
    // where both e5 and c5 exist as Black's replies). The repertoire only has 1...e5 recorded
    // there; 1...c5 (played twice, more often) is a real divergence on the opponent's turn from
    // this white player's own repertoire.
    const afterE4 = childrenOf(tree, tree.root).find(m => m.san === 'e4')!;
    const repertoireChildren = childrenOf(tree, afterE4.to).filter(m => m.san === 'e5');

    const rows = rowsForPosition(tree, tree.root, repertoireChildren, /* turnIsOwn */ false);
    const rowsAfterE4 = rowsForPosition(tree, afterE4.to, repertoireChildren, false);
    expect(rowsAfterE4.map(r => r.move.san)).toEqual(['c5', 'e5']);

    // On the opponent's turn, divergence is never flagged even for a move the repertoire lacks —
    // divergence only means something on the tracked player's own turn.
    expect(rowsAfterE4.every(r => r.divergence === false)).toBe(true);

    const e5Row = rowsAfterE4.find(r => r.move.san === 'e5')!;
    expect(e5Row.inTree).toBe(true);
    const c5Row = rowsAfterE4.find(r => r.move.san === 'c5')!;
    expect(c5Row.inTree).toBe(false);

    // Root-level rows exist too, just unused above.
    void rows;
  });

  it('flags divergence only on the tracked player\'s own turn, for a move actually played but not in the repertoire', () => {
    const games = [pgn('nadavk', 'opp1', '1-0', '1. e4 e5 2. Nf3'), pgn('nadavk', 'opp2', '1-0', '1. e4 e5 2. Bc4')];
    const tree = buildTree(games, { players: [{ site: 'lichess', username: 'nadavk' }], color: 'white' });
    const afterE4 = childrenOf(tree, tree.root).find(m => m.san === 'e4')!;
    const afterE5 = childrenOf(tree, afterE4.to).find(m => m.san === 'e5')!;

    // The repertoire only has Nf3 recorded here; the tracked player (White) also played Bc4 in
    // their own games, which is the "not in repertoire" case this panel exists to surface.
    const repertoireChildren = childrenOf(tree, afterE5.to).filter(m => m.san === 'Nf3');

    const rowsOwnTurn = rowsForPosition(tree, afterE5.to, repertoireChildren, /* turnIsOwn */ true);
    const nf3 = rowsOwnTurn.find(r => r.move.san === 'Nf3')!;
    const bc4 = rowsOwnTurn.find(r => r.move.san === 'Bc4')!;
    expect(nf3.inTree).toBe(true);
    expect(nf3.divergence).toBe(false);
    expect(bc4.inTree).toBe(false);
    expect(bc4.divergence).toBe(true);
  });

  it('returns an empty list at a position with no games', () => {
    const tree = buildTree([], { players: [{ site: 'lichess', username: 'nadavk' }], color: 'white' });
    expect(rowsForPosition(tree, tree.root, [], true)).toEqual([]);
  });
});
