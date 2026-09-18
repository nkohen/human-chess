// @vitest-environment jsdom
//
// An end-to-end reload-survival check through the real top-level component (as opposed to
// persistence.test.ts, which exercises each snapshot parser/rebuilder in isolation): seed
// localStorage the way a previous session's `usePersistedState` writes would have left it, mount
// `OpeningsBuilder` cold, and check it comes back exactly where the user was — the selected
// opening, mode, and in-opening/drill path.
//
// Network safety is mechanical, not just "this mounts in a mode that happens not to render
// GamesTreeView/SourcesPanel": `fetch` is stubbed to always reject, in every test here, so a
// change that accidentally exercised a lichess/chess.com code path would fail loudly instead of
// quietly depending on jsdom (which, contrary to a stale claim this comment used to make, does
// not itself block outgoing requests).
//
// Authored as `.ts` (JSX needs `.tsx`, and this repo's vitest config only picks up `*.test.ts`)
// using `createElement` directly instead of JSX syntax.
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpeningsBuilder } from './OpeningsBuilder';
import { BUILDER_STATE_KEY, BUILD_PATH_KEY, DRILL_STATE_KEY, type BuilderStateSnapshot, type BuildPathSnapshot, type DrillSnapshot } from './persistence';
import { addMove, createOpening, serialize } from './repertoire';

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

  it('restores Drill mode and the saved trail (no engine needed)', () => {
    let opening = createOpening('Italian Game', 'white');
    opening = addMove(opening, opening.root, 'e2e4');
    const afterE4 = opening.nodes[opening.root]!.moves[0]!.to;
    opening = addMove(opening, afterE4, 'e7e5');

    localStorage.setItem('human-chess.openings.v1', `[${serialize(opening)}]`);

    const builderState: BuilderStateSnapshot = { selectedId: opening.id, mode: 'drill', severalIds: [], newName: '', newColor: 'white' };
    localStorage.setItem(BUILDER_STATE_KEY, JSON.stringify(builderState));

    // drillScope defaults to 'one' (yourGamesStorage-style loadDrillScope, unseeded here), so
    // DrillView's own drillOpenings is just [opening] and its scopeKey is opening.id.
    const drillSnapshot: DrillSnapshot = { scopeKey: opening.id, trail: ['e2e4', 'e7e5'], status: 'playing', expected: [] };
    localStorage.setItem(DRILL_STATE_KEY, JSON.stringify(drillSnapshot));

    const { container } = render(createElement(OpeningsBuilder, { engine: undefined }));

    // Drill mode rendered: the mode SegmentedControl's "Drill" segment is the pressed one.
    const modeGroup = container.querySelector('[aria-label="Build, drill, or your games"]');
    const drillSegment = [...(modeGroup?.querySelectorAll('button') ?? [])].find(b => b.textContent === 'Drill');
    expect(drillSegment?.getAttribute('aria-pressed')).toBe('true');

    // The restored trail shows both moves rather than DrillView's own "(start)" placeholder.
    expect(container.textContent).not.toMatch(/\(start\)/);
    expect(container.textContent).toContain('e4');
    expect(container.textContent).toContain('e5');
  });

  it('rejects a legal-but-out-of-repertoire saved trail rather than restoring it as a completed line', () => {
    // Repro: drilled to e7e5, switched to Build, deleted e7e5 from the tree, switched back to
    // Drill. e7e5 is still a perfectly legal chess move (replayTrail succeeds), but it is no
    // longer in this opening's own graph — nextMoveOptions/acceptedMoves are both empty for it
    // for the same reason a genuinely finished line is empty, so restoring it verbatim would
    // silently show "Line complete." instead of resetting.
    let opening = createOpening('Italian Game', 'white');
    opening = addMove(opening, opening.root, 'e2e4'); // only e2e4 is recorded; e7e5 never was
    localStorage.setItem('human-chess.openings.v1', `[${serialize(opening)}]`);

    const builderState: BuilderStateSnapshot = { selectedId: opening.id, mode: 'drill', severalIds: [], newName: '', newColor: 'white' };
    localStorage.setItem(BUILDER_STATE_KEY, JSON.stringify(builderState));

    const drillSnapshot: DrillSnapshot = { scopeKey: opening.id, trail: ['e2e4', 'e7e5'], status: 'complete', expected: [] };
    localStorage.setItem(DRILL_STATE_KEY, JSON.stringify(drillSnapshot));

    const { container } = render(createElement(OpeningsBuilder, { engine: undefined }));

    expect(container.textContent).not.toContain('Line complete.');
    expect(container.textContent).toMatch(/\(start\)/);
  });
});
