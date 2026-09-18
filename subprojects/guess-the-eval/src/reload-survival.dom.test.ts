// @vitest-environment jsdom
// Reload survival (docs/design/2026-09-18-reload-survival.md): these are the "seed localStorage,
// mount the screen, assert the restored phase and values" render tests the design doc asks for,
// one scenario per screen. No test here ever constructs a real engine (no wasm, no network) —
// every restored phase exercised below is one whose effects are gated on `phase === 'generating'`
// or `'evaluating'` (SoloRound.tsx/PvpRound.tsx), so a stub object that is never actually called
// stands in for "an engine is ready" without doing any engine work. `engine={undefined}` (the
// literal case, "still loading") is covered too, as the base case every reload starts from before
// the engine finishes loading: the restored snapshot must survive untouched until it does.
//
// JSX is avoided here (this file is `.test.ts`, matched by the root vitest include glob, which
// only picks up `.test.ts`; `React.createElement` keeps it a plain `.ts` file).
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { UciEngine } from '@human-chess/engine';
import type { RecipePosition } from '@human-chess/positions';
import { GuessTheEval } from './GuessTheEval';
import { SoloRound } from './SoloRound';
import { PvpRound } from './PvpRound';
import { GTE_PVP_KEY, GTE_SOLO_KEY, GTE_TOP_KEY, type PvpSnapshot, type SoloSnapshot, type TopSnapshot } from './snapshot';

// Never constructed with a real transport, and never called in any scenario below — see the file
// comment. A method invoked here in error is a real test failure (a real engine call snuck in),
// not a silent no-op.
const stubEngine = {
  analyse: () => {
    throw new Error('stub engine: analyse should not be called for an already-restored phase');
  },
  stop: () => {
    throw new Error('stub engine: stop should not be called for an already-restored phase');
  },
} as unknown as UciEngine;

const POSITION: RecipePosition = { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', recipe: 'quiet', description: 'a king and king endgame', moves: ['a1a2'] };
const SCORE = { type: 'cp' as const, value: 120 };
const ANALYSIS = {
  engine: 'stockfish',
  fen: POSITION.fen,
  moves: [],
  limit: { depth: 14 },
  multipv: 1,
  bestmove: 'a2a3',
  lines: [{ multipv: 1, depth: 14, score: SCORE, pv: ['a2a3'] }],
  elapsedMs: 500,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('GuessTheEval: the top-level screen/mode routes straight back in', () => {
  it('a persisted PvP screen renders PvpRound, not the settings screen, on the very first paint', () => {
    const top: TopSnapshot = { screen: 'pvp', mode: 'pvp' };
    localStorage.setItem(GTE_TOP_KEY, JSON.stringify(top));
    render(createElement(GuessTheEval, { engine: undefined }));
    expect(screen.getByText('Guess the eval — PvP')).toBeTruthy();
    expect(screen.queryByText('Guess the eval')).toBeNull(); // not the settings Page's <h1>
  });

  it('a persisted solo screen renders SoloRound directly', () => {
    const top: TopSnapshot = { screen: 'solo', mode: 'solo' };
    localStorage.setItem(GTE_TOP_KEY, JSON.stringify(top));
    render(createElement(GuessTheEval, { engine: undefined }));
    // SoloRound's own Workbench title, not GuessTheEval's settings Page title.
    expect(screen.getAllByText('Guess the eval').length).toBeGreaterThan(0);
    expect(screen.getByText('Loading the engine…')).toBeTruthy();
  });
});

describe('SoloRound: engine={undefined} on first paint never discards the restored snapshot', () => {
  it('shows the loading state but leaves the persisted mid-round snapshot in storage untouched', () => {
    const snap: SoloSnapshot = { position: POSITION, phase: 'guessing', guessCp: 170, timedOut: false, roundIndex: 3, results: [], endAt: undefined, analysis: undefined };
    localStorage.setItem(GTE_SOLO_KEY, JSON.stringify(snap));
    render(createElement(SoloRound, { engine: undefined, timeLimitSec: undefined, onExit: () => undefined }));
    expect(screen.getByText('Loading the engine…')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(GTE_SOLO_KEY)!)).toEqual(snap);
  });
});

describe('SoloRound: a restored phase paints on the very first render, without any engine call', () => {
  it('a revealed position shows its stored analysis, never a recomputed one', () => {
    const snap: SoloSnapshot = {
      position: POSITION,
      phase: 'revealed',
      guessCp: 100,
      timedOut: false,
      roundIndex: 0,
      results: [{ truth: SCORE, guessCp: 100, points: 8, timedOut: false, recipeDescription: POSITION.description }],
      endAt: undefined,
      analysis: ANALYSIS,
    };
    localStorage.setItem(GTE_SOLO_KEY, JSON.stringify(snap));
    render(createElement(SoloRound, { engine: stubEngine, timeLimitSec: undefined, onExit: () => undefined }));
    expect(screen.getAllByText(/\+1\.2 pawns/).length).toBeGreaterThan(0);
    expect(screen.getByText('Next position')).toBeTruthy();
  });

  it('the summary screen restores every round result and their running total', () => {
    const snap: SoloSnapshot = {
      position: undefined,
      phase: 'summary',
      guessCp: 0,
      timedOut: false,
      roundIndex: 4,
      results: [
        { truth: SCORE, guessCp: 100, points: 8, timedOut: false, recipeDescription: 'one' },
        { truth: SCORE, guessCp: 250, points: 3, timedOut: true, recipeDescription: 'two' },
      ],
      endAt: undefined,
      analysis: undefined,
    };
    localStorage.setItem(GTE_SOLO_KEY, JSON.stringify(snap));
    const { container } = render(createElement(SoloRound, { engine: stubEngine, timeLimitSec: undefined, onExit: () => undefined }));
    // 8 + 3 restored from `results`, out of ROUNDS(5) * MAX_POINTS(5000) — split across sibling
    // text nodes by JSX, so matched against the row's combined text rather than one exact node.
    const totalRow = container.querySelector('.gte-summary-total-row .gte-bar-value');
    expect(totalRow?.textContent?.replace(/\s+/g, ' ').trim()).toBe('11 / 25000');
    expect(screen.getByText('Play again')).toBeTruthy();
  });
});

describe('PvpRound: a restored handover/reveal/results phase paints without any engine call', () => {
  it('handover names the player it was actually handed to, restored from turnPlayer', () => {
    const snap: PvpSnapshot = {
      position: POSITION,
      phase: 'handover',
      roundIndex: 1,
      results: [],
      endAt: undefined,
      analysis: undefined,
      turnPlayer: 2,
      sliderCp: 0,
      guess1Cp: 220,
      guess1UsedMs: 4000,
      timedOut1: false,
      timedOut2: false,
      analysingIndex: undefined,
    };
    localStorage.setItem(GTE_PVP_KEY, JSON.stringify(snap));
    render(createElement(PvpRound, { engine: stubEngine, player1: 'Alice', player2: 'Bo', limitSec: 30, onExit: () => undefined }));
    expect(screen.getByText('Pass the device to Bo.')).toBeTruthy();
    expect(screen.queryByText('Pass the device to Alice.')).toBeNull();
  });

  it('the results screen restores both players’ totals from the stored per-position results', () => {
    const snap: PvpSnapshot = {
      ...({} as PvpSnapshot),
      position: undefined,
      phase: 'results',
      roundIndex: 4,
      results: [
        {
          fen: POSITION.fen,
          lastMove: ['a1', 'a2'],
          truth: SCORE,
          guess1Cp: 100,
          guess2Cp: 300,
          points1: 8,
          points2: 2,
          timedOut1: false,
          timedOut2: false,
          recipeDescription: POSITION.description,
        },
      ],
      endAt: undefined,
      analysis: undefined,
      turnPlayer: 1,
      sliderCp: 0,
      guess1Cp: 0,
      guess1UsedMs: 0,
      timedOut1: false,
      timedOut2: false,
      analysingIndex: undefined,
    };
    localStorage.setItem(GTE_PVP_KEY, JSON.stringify(snap));
    render(createElement(PvpRound, { engine: stubEngine, player1: 'Alice', player2: 'Bo', limitSec: 30, onExit: () => undefined }));
    expect(screen.getByText('Alice wins, 8 to 2.')).toBeTruthy();
  });
});
