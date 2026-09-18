// @vitest-environment jsdom
//
// An end-to-end reload-survival check through the real top-level component (as opposed to
// persistence.test.ts, which exercises each snapshot parser/rebuilder in isolation): seed
// localStorage the way a previous session's `usePersistedState` writes would have left it, mount
// `OpeningsBuilder` cold, and check it comes back exactly where the user was — the selected
// opening, Build mode, and the in-opening path — without ever touching the network (this mounts
// in Build mode only, so GamesTreeView/SourcesPanel, the only pieces that talk to lichess/chess.com,
// never render; Vitest's default jsdom has no network access regardless).
//
// Authored as `.ts` (JSX needs `.tsx`, and this repo's vitest config only picks up `*.test.ts`)
// using `createElement` directly instead of JSX syntax.
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { OpeningsBuilder } from './OpeningsBuilder';
import { BUILDER_STATE_KEY, BUILD_PATH_KEY, type BuilderStateSnapshot, type BuildPathSnapshot } from './persistence';
import { addMove, createOpening, serialize } from './repertoire';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('OpeningsBuilder: reload survival end to end', () => {
  it('restores the selected opening, Build mode, and the saved in-opening path from a cold localStorage', () => {
    let opening = createOpening('Italian Game', 'white');
    opening = addMove(opening, opening.root, 'e2e4');
    const afterE4 = opening.nodes[opening.root]!.moves[0]!.to;
    opening = addMove(opening, afterE4, 'e7e5');

    // The repertoire itself (storage.ts's own key/shape, untouched by this feature).
    localStorage.setItem('human-chess.openings.v1', `[${serialize(opening)}]`);

    const builderState: BuilderStateSnapshot = { selectedId: opening.id, mode: 'build', severalIds: [], newName: '', newColor: 'white' };
    localStorage.setItem(BUILDER_STATE_KEY, JSON.stringify(builderState));

    const pathSnapshot: BuildPathSnapshot = { openingId: opening.id, ucis: ['e2e4', 'e7e5'] };
    localStorage.setItem(BUILD_PATH_KEY, JSON.stringify(pathSnapshot));

    const { container } = render(createElement(OpeningsBuilder, { engine: undefined }));

    const select = container.querySelector('#ob-opening-select') as HTMLSelectElement | null;
    expect(select?.value).toBe(opening.id);

    // Build mode rendered (BuilderView's "Tree at this position" panel), not the "pick or create
    // an opening" placeholder and not Drill/Your games.
    expect(container.querySelector('.ob-children')).not.toBeNull();

    // The restored path shows both moves rather than BuilderView's own "(start)" placeholder.
    const pathEl = container.querySelector('.ob-path');
    expect(pathEl?.textContent).not.toMatch(/\(start\)/);
    expect(pathEl?.textContent).toContain('e4');
    expect(pathEl?.textContent).toContain('e5');
  });

  it('falls back to the first opening when the persisted selectedId no longer exists', () => {
    const opening = createOpening('London System', 'white');
    localStorage.setItem('human-chess.openings.v1', `[${serialize(opening)}]`);

    const builderState: BuilderStateSnapshot = { selectedId: 'op_stale_deleted', mode: 'build', severalIds: [], newName: '', newColor: 'white' };
    localStorage.setItem(BUILDER_STATE_KEY, JSON.stringify(builderState));

    const { container } = render(createElement(OpeningsBuilder, { engine: undefined }));

    const select = container.querySelector('#ob-opening-select') as HTMLSelectElement | null;
    expect(select?.value).toBe(opening.id);
  });
});
