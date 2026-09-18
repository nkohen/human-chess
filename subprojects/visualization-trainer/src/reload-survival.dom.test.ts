// @vitest-environment jsdom
// Reload survival (docs/design/2026-09-18-reload-survival.md): "seed localStorage, mount the
// screen, assert the restored phase and values" render tests, one per screen, plus the
// clock-rule case for MemorizeTrainer's study countdown (an `endAt` in the past moves straight
// on to rebuilding on the very first render, honestly, never silently extended).
//
// No test here ever constructs a real engine (no wasm, no network). LinesTrainer's 'ready'/
// revealed scenario uses a stub that must never be called — its effect is gated on
// `hasStoredExercise`, so a restored line is never re-mined. MemorizeTrainer needs no engine at
// all (memorize.ts's scoring is a pure board-state comparison, not an evaluation).
//
// JSX is avoided here (this file is `.test.ts`, matched by the root vitest include glob, which
// only picks up `.test.ts`; `React.createElement` keeps it a plain `.ts` file).
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { UciEngine } from '@human-chess/engine';
import { START_FEN } from '@human-chess/rules';
import { VisualizationTrainer } from './VisualizationTrainer';
import { LinesTrainer } from './LinesTrainer';
import { MemorizeTrainer } from './MemorizeTrainer';
import { freshMemorizeSnapshot, VT_LINES_KEY, VT_MEMORIZE_KEY, type LinesSnapshot, type MemorizeSnapshot } from './snapshot';

const MODE_KEY = 'human-chess.visualization-trainer.mode';

// Never constructed with a real transport, and never called in any scenario below — see the file
// comment. A method invoked here in error is a real test failure (a real engine call snuck in).
const stubEngine = {
  analyse: () => {
    throw new Error('stub engine: analyse should not be called for an already-restored exercise');
  },
  stop: () => {
    throw new Error('stub engine: stop should not be called for an already-restored exercise');
  },
} as unknown as UciEngine;

const OPENING_UCIS = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('VisualizationTrainer: the persisted mode routes straight back in', () => {
  it('a persisted "memorize" mode renders MemorizeTrainer, not the Lines screen', () => {
    localStorage.setItem(MODE_KEY, 'memorize');
    render(createElement(VisualizationTrainer, { engine: undefined }));
    expect(screen.getByText('Visualization trainer — Memorize')).toBeTruthy();
    expect(screen.queryByText('Loading the engine…')).toBeNull();
  });

  it('a persisted "lines" mode renders LinesTrainer', () => {
    localStorage.setItem(MODE_KEY, 'lines');
    render(createElement(VisualizationTrainer, { engine: undefined }));
    expect(screen.getByText('Loading the engine…')).toBeTruthy();
  });
});

describe('LinesTrainer: a restored line is shown without any engine call', () => {
  it('engine={undefined} on first paint shows the loading status and leaves the snapshot untouched', () => {
    const snap: LinesSnapshot = {
      startPosition: { fen: START_FEN, moves: [] },
      exercise: { startFen: START_FEN, ucis: OPENING_UCIS },
      answers: { check: undefined, pieceOn: undefined, material: '' },
      revealed: false,
      tally: { correct: 1, total: 3 },
      round: 2,
      sessionDone: false,
    };
    localStorage.setItem(VT_LINES_KEY, JSON.stringify(snap));
    render(createElement(LinesTrainer, { engine: undefined }));
    expect(screen.getByText('Loading the engine…')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(VT_LINES_KEY)!)).toEqual(snap);
  });

  it('a revealed exercise restores its stored line and running score, without an engine call', () => {
    const snap: LinesSnapshot = {
      startPosition: { fen: START_FEN, moves: [] },
      exercise: { startFen: START_FEN, ucis: OPENING_UCIS },
      answers: { check: false, pieceOn: '', material: '0' },
      revealed: true,
      tally: { correct: 2, total: 3 },
      round: 3,
      sessionDone: false,
    };
    localStorage.setItem(VT_LINES_KEY, JSON.stringify(snap));
    render(createElement(LinesTrainer, { engine: stubEngine }));
    expect(screen.getByText('Score: 2 / 3')).toBeTruthy();
    expect(screen.getByText('Exercise 3 of 5')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
  });
});

describe('MemorizeTrainer: a restored phase paints on the very first render, without any engine', () => {
  it('a studying phase with time still on the clock restores the remaining seconds', () => {
    const snap: MemorizeSnapshot = {
      studySeconds: 20,
      source: 'random',
      sessionFens: [START_FEN],
      results: [],
      phase: { kind: 'studying', index: 0, fen: START_FEN, studySeconds: 20, endAt: Date.now() + 15_000 },
    };
    localStorage.setItem(VT_MEMORIZE_KEY, JSON.stringify(snap));
    render(createElement(MemorizeTrainer, {}));
    expect(screen.getByText('Position 1 of 1')).toBeTruthy();
    expect(screen.getByText(/Study it: \d+s left/)).toBeTruthy();
  });

  it('clock rule: a studying phase whose endAt is already past moves straight on to rebuilding', () => {
    const snap: MemorizeSnapshot = {
      studySeconds: 20,
      source: 'random',
      sessionFens: [START_FEN],
      results: [],
      phase: { kind: 'studying', index: 0, fen: START_FEN, studySeconds: 20, endAt: Date.now() - 5_000 },
    };
    localStorage.setItem(VT_MEMORIZE_KEY, JSON.stringify(snap));
    render(createElement(MemorizeTrainer, {}));
    expect(screen.getByText(/Rebuilding: \d/)).toBeTruthy();
    expect(screen.queryByText(/Study it:/)).toBeNull();
    const stored = JSON.parse(localStorage.getItem(VT_MEMORIZE_KEY)!) as MemorizeSnapshot;
    expect(stored.phase.kind).toBe('rebuilding');
  });

  it('clock rule: a studying phase whose endAt is still in the future is left running, not restarted', () => {
    const endAt = Date.now() + 12_345;
    const snap: MemorizeSnapshot = {
      studySeconds: 20,
      source: 'random',
      sessionFens: [START_FEN],
      results: [],
      phase: { kind: 'studying', index: 0, fen: START_FEN, studySeconds: 20, endAt },
    };
    localStorage.setItem(VT_MEMORIZE_KEY, JSON.stringify(snap));
    render(createElement(MemorizeTrainer, {}));
    const stored = JSON.parse(localStorage.getItem(VT_MEMORIZE_KEY)!) as MemorizeSnapshot;
    expect(stored.phase.kind).toBe('studying');
    expect(stored.phase.kind === 'studying' && stored.phase.endAt).toBe(endAt); // untouched, not restarted from the full limit
  });

  it('a reviewed phase restores its stored score without recomputation', () => {
    const score = { correct: 5, missing: 1, extra: 0, wrongPiece: 0, totalOriginalPieces: 6, score: 5 / 6, diffs: [] };
    const snap: MemorizeSnapshot = {
      studySeconds: 10,
      source: 'random',
      sessionFens: [START_FEN],
      results: [{ studySeconds: 10, rebuildMs: 4200, score }],
      phase: { kind: 'reviewed', index: 0, fen: START_FEN, studySeconds: 10, rebuildMs: 4200, placement: '8/8/8/8/8/8/8/K7', score },
    };
    localStorage.setItem(VT_MEMORIZE_KEY, JSON.stringify(snap));
    render(createElement(MemorizeTrainer, {}));
    expect(screen.getByText('5 / 6 correct (83%)')).toBeTruthy();
    expect(screen.getByText('See results')).toBeTruthy(); // last (only) position in the session
  });

  it('the summary screen restores every result', () => {
    const score = { correct: 3, missing: 0, extra: 0, wrongPiece: 0, totalOriginalPieces: 3, score: 1, diffs: [] };
    const snap: MemorizeSnapshot = {
      ...freshMemorizeSnapshot(10, 'random'),
      sessionFens: [START_FEN],
      results: [{ studySeconds: 10, rebuildMs: 1000, score }],
      phase: { kind: 'summary' },
    };
    localStorage.setItem(VT_MEMORIZE_KEY, JSON.stringify(snap));
    render(createElement(MemorizeTrainer, {}));
    expect(screen.getByText('Position 1')).toBeTruthy();
    expect(screen.getByText('Average: 100%')).toBeTruthy();
    expect(screen.getByText('Play again')).toBeTruthy();
  });
});

// Review item 2: a fresh #/visualization?fen=... hand-off (puzzles' "Memorize this position", or
// any future sender) must win over a persisted mid-session Memorize snapshot — not be silently
// dropped in favour of restoring the old session, which is what happened before firstFen wired
// into a clearPersisted-above-usePersistedState hook (BotRatingTest.tsx's own pattern for the
// same problem).
describe('VisualizationTrainer: a fresh hand-off wins over a persisted mid-session Memorize snapshot', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('lands on the Memorize settings screen with the hand-off notice, and strips the query string', () => {
    const midSession: MemorizeSnapshot = {
      studySeconds: 20,
      source: 'curated',
      sessionFens: [START_FEN],
      results: [],
      phase: { kind: 'studying', index: 0, fen: START_FEN, studySeconds: 20, endAt: Date.now() + 15_000 },
    };
    localStorage.setItem(VT_MEMORIZE_KEY, JSON.stringify(midSession));
    window.location.hash = `#/visualization?fen=${encodeURIComponent(START_FEN)}`;

    render(createElement(VisualizationTrainer, { engine: undefined }));

    // Settings, not the restored studying phase: the hand-off won.
    expect(screen.getByText('Visualization trainer — Memorize')).toBeTruthy();
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.queryByText(/Study it:/)).toBeNull();
    expect(screen.getByText('The position handed over from the other tool will be the first one to memorize.')).toBeTruthy();
    // consumeHandoffParams strips the query string via history.replaceState as it reads it.
    expect(window.location.hash).toBe('#/visualization');
    // Study preferences carry over from the old session (the learner's own setting), even though
    // the session itself restarted.
    expect(screen.getByText('Curated (your games)').closest('button')?.getAttribute('aria-pressed')).toBe('true');
  });
});
