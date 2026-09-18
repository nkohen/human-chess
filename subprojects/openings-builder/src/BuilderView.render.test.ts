// @vitest-environment jsdom
//
// BuilderView's inline "Your games" panel (OwnGamesPanel.tsx, task: bring the openingtree-style
// own-games statistics into Build mode, 2026-09-18), exercised end to end through the real
// component: seed the shared games store (jsdom has no IndexedDB, so @human-chess/store's
// openGamesStore() falls back to its in-memory implementation — same fallback
// OpeningsBuilder.render.test.ts relies on for SourcesPanel/GamesTreeView), mount BuilderView with
// no engine, and check the panel shows what the seeded game actually recorded, that "Add" wires
// into the same addMove/onOpeningChange path as the rest of Build mode, and that the panel's own
// empty state shows when no account is linked at all.
//
// `getGamesStore()` is a module-level singleton (gamesStore.ts), so its state persists across
// every test in this file — the no-accounts test runs first, before anything seeds a source, so
// it never has to explicitly clear one.
//
// Authored as `.ts` (this repo's vitest config only picks up `*.test.ts`) using `createElement`
// directly instead of JSX syntax.
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importPgn, type ImportedGame, type StoredImportedGame } from '@human-chess/import';
import { BuilderView } from './BuilderView';
import { getGamesStore } from './gamesStore';
import { createOpening, type Opening } from './repertoire';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('network disabled in tests'))),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

/** Same helper as tree.test.ts/MoveTree.render.test.ts/ownGamesTree.test.ts: a hand-written PGN
 * imported the way a pasted-PGN ImportedGame would be, given a fake `id` so it satisfies
 * StoredImportedGame (what the games store persists). */
function pgn(white: string, black: string, result: string, moves: string, extra: Partial<ImportedGame> = {}): StoredImportedGame {
  const game = importPgn(`[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`);
  return { ...game, ...extra, id: `${white}-${black}-${moves}-${Math.random()}` };
}

describe('BuilderView: "Your games" panel', () => {
  it('shows no linked accounts info status when nothing is synced yet', async () => {
    const opening: Opening = createOpening('Italian Game', 'white');

    const { container } = render(createElement(BuilderView, { opening, onOpeningChange: () => {}, engine: undefined, controls: null }));

    await waitFor(() => {
      expect(container.textContent).toContain('Link a lichess or chess.com account in Your games mode to see your own games here.');
    });
  });

  it('shows the seeded move with its count, flags it as not in repertoire, and Add wires into the repertoire', async () => {
    const source = { site: 'lichess' as const, username: 'tester' };
    await getGamesStore().putGames(source, [pgn('tester', 'opp', '1-0', '1. e4 e5')]);

    const opening: Opening = createOpening('Italian Game', 'white');
    const onOpeningChange = vi.fn();

    const { container } = render(createElement(BuilderView, { opening, onOpeningChange, engine: undefined, controls: null }));

    await waitFor(() => {
      expect(container.querySelector('.ob-own-games-san')?.textContent).toBe('e4');
    });

    // One of the tracked player's own games reached this position, and it's the tracked player's
    // own turn (white repertoire, starting position) — so this is "what you played here", and e4
    // isn't in the (empty) repertoire yet.
    expect(container.textContent).toContain('1 of your games reached this position');
    expect(container.textContent).toContain('What you played here');
    expect(container.querySelector('.ob-own-games-count')?.textContent).toBe('1');
    expect(container.querySelector('.ob-own-games-divergence')?.textContent).toBe('not in repertoire');

    const addButtons = [...container.querySelectorAll('.ob-own-games button')].filter(b => b.textContent === 'Add');
    expect(addButtons.length).toBe(1);
    fireEvent.click(addButtons[0]!);

    expect(onOpeningChange).toHaveBeenCalledTimes(1);
    const updated = onOpeningChange.mock.calls[0]![0] as Opening;
    expect(updated.nodes[updated.root]?.moves.map(m => m.uci)).toEqual(['e2e4']);

    // The board's own path (BuilderView's local state, independent of the `opening` prop this
    // test never feeds back) advanced past the played move rather than staying at "(start)".
    await waitFor(() => {
      expect(container.querySelector('.ob-path')?.textContent).not.toMatch(/\(start\)/);
    });
    expect(container.querySelector('.ob-path')?.textContent).toContain('e4');
  });
});
