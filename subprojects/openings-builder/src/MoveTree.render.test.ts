// @vitest-environment jsdom
//
// Component-level check for the empty-tree reconciliation guard: GamesTreeView's `tree` is built
// asynchronously (an IndexedDB read resolves after mount), so every mount briefly sees the
// transient empty placeholder tree before the real one arrives, and again whenever a sync/filter
// change is in flight. reconcileMoveTreeKeys itself is exercised directly in persistence.test.ts;
// this file exercises the part that only exists at the component level — MoveTree's own "skip
// reconciliation while the incoming tree has no root children" guard around the reconcile calls
// — which persistence.test.ts's pure-function tests can't see.
//
// Authored as `.ts` (this repo's vitest config only picks up `*.test.ts`) using `createElement`
// directly instead of JSX syntax.
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { importPgn, type ImportedGame } from '@human-chess/import';
import { buildGamesTree } from '@human-chess/opening-tree';
import { MoveTree } from './MoveTree';
import { MOVE_TREE_EXPANDED_KEY } from './persistence';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** Same helper as persistence.test.ts: a hand-written PGN imported the way a pasted-PGN
 * ImportedGame would be. */
function pgn(white: string, black: string, result: string, moves: string, extra: Partial<ImportedGame> = {}): ImportedGame {
  const game = importPgn(`[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`);
  return { ...game, ...extra };
}

describe('MoveTree: reconciliation guard against the transient empty tree', () => {
  it('leaves a persisted expanded set untouched when the tree changes to (another) empty tree', () => {
    localStorage.setItem(MOVE_TREE_EXPANDED_KEY, JSON.stringify(['', 'e2e4']));

    const emptyTreeA = buildGamesTree([], 'nadavk', 'white');
    const { rerender } = render(createElement(MoveTree, { tree: emptyTreeA, path: [], onNavigate: () => {}, color: 'white' }));

    // A fresh empty-tree object (as a new sync attempt or a filter change would produce) is a
    // different reference from `emptyTreeA` but has the same (empty) content.
    const emptyTreeB = buildGamesTree([], 'nadavk', 'white');
    rerender(createElement(MoveTree, { tree: emptyTreeB, path: [], onNavigate: () => {}, color: 'white' }));

    // Without the guard, reconciling 'e2e4' against an empty tree drops it (nothing resolves),
    // and that reduced set would get written back over the seeded one. With the guard, the
    // reconcile call against an empty tree never runs, so nothing is ever written past the
    // initial (skipped) mount write, and the seeded value survives untouched.
    expect(JSON.parse(localStorage.getItem(MOVE_TREE_EXPANDED_KEY)!)).toEqual(['', 'e2e4']);
  });

  it('does reconcile once a real (non-empty) tree arrives, dropping what no longer resolves', () => {
    localStorage.setItem(MOVE_TREE_EXPANDED_KEY, JSON.stringify(['', 'e2e4', 'd2d4']));

    const emptyTree = buildGamesTree([], 'nadavk', 'white');
    const { rerender } = render(createElement(MoveTree, { tree: emptyTree, path: [], onNavigate: () => {}, color: 'white' }));

    // The "real" tree once the async games load resolves: 'e2e4' was actually played (resolves),
    // 'd2d4' was not (the stale key the seeded snapshot no longer has).
    const games = [pgn('nadavk', 'opp', '1-0', '1. e4 e5')];
    const realTree = buildGamesTree(games, 'nadavk', 'white');
    rerender(createElement(MoveTree, { tree: realTree, path: [], onNavigate: () => {}, color: 'white' }));

    expect(JSON.parse(localStorage.getItem(MOVE_TREE_EXPANDED_KEY)!).sort()).toEqual(['', 'e2e4'].sort());
  });
});
