// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UciEngine, type UciTransport } from '@human-chess/engine';
import { endgameLadder } from '@human-chess/positions';
import { EndgamesIntro } from './EndgamesIntro';
import { SNAPSHOT_KEY, type EndgamesSnapshot } from './snapshot';

/** A UciEngine instance whose transport never answers anything — enough to satisfy
 * EndgamesIntro's `engine` prop type without contacting a real engine. The snapshot below
 * restores the game to a position where it is the learner's own turn (white, two plies played),
 * so the opponent-move effect never runs and this transport is never exercised; if it were, it
 * would just hang rather than let a real search run (never the wasm engine in tests). */
function inertEngine(): UciEngine {
  const transport: UciTransport = { send: () => {}, onLine: () => {}, onError: () => {}, close: () => {} };
  return new UciEngine(transport);
}

const LESSON = endgameLadder.find(l => l.id === 'two-rooks-open-1')!;

const SNAPSHOT: EndgamesSnapshot = {
  mode: 'lesson',
  lesson: LESSON,
  curatedEntry: undefined,
  showIntro: false,
  startColor: 'white',
  // Two legal plies from the lesson's own start fen (verified in snapshot.test.ts's round-trip
  // test): White rook h1-h4, then Black king e5-d5 — back to White (the learner) to move.
  moves: ['h1h4', 'e5d5'],
};

function storedSnapshot(s: EndgamesSnapshot): unknown {
  return { mode: s.mode, lessonId: s.lesson.id, curatedEntryId: s.curatedEntry?.id, showIntro: s.showIntro, startColor: s.startColor, moves: s.moves };
}

describe('EndgamesIntro reload restore', () => {
  beforeEach(() => localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(storedSnapshot(SNAPSHOT))));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('seeds the restored lesson, colour and played moves in the initialiser, before the engine loads', () => {
    // Mount with no engine at all — exactly what a reload looks like while the wasm engine is
    // still initialising. Nothing here is reset or lost while waiting (design doc: "seed in the
    // initialiser, not an effect").
    const { rerender } = render(createElement(EndgamesIntro, { engine: undefined }));
    expect(screen.getByText(/Loading the engine…/)).toBeTruthy();

    // Providing the engine (a later render, no remount and so no re-read of storage) reveals the
    // state that was already restored at mount: the two-rooks lesson, no intro dialog (already
    // dismissed before the reload), White as the learner's colour, and the two moves already
    // replayed leaving it the learner's own turn again.
    rerender(createElement(EndgamesIntro, { engine: inertEngine() }));

    // Not getByText: the lesson's title also appears verbatim as its entry in the lesson list.
    expect(screen.getByRole('heading', { name: 'Two rooks: the ladder' })).toBeTruthy();
    expect(screen.getByText(/You play white\./)).toBeTruthy();
    expect(screen.getByText(/^Your move\.$/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull(); // the "Let's go" intro card is not shown again
  });

  it('rejects a corrupt snapshot and falls back to the ordinary first-open lesson', () => {
    localStorage.setItem(SNAPSHOT_KEY, '{not json');
    const { rerender } = render(createElement(EndgamesIntro, { engine: undefined }));
    expect(screen.getByText(/Loading the engine…/)).toBeTruthy();
    rerender(createElement(EndgamesIntro, { engine: inertEngine() }));
    // No crash, and the ordinary default (the intro dialog for the first unconfident lesson) is
    // shown instead of anything from the corrupt entry.
    expect(screen.queryByRole('dialog')).toBeTruthy();
  });
});
