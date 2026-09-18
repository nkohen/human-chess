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
import { createElement, StrictMode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UciEngine } from '@human-chess/engine';
import type { RecipePosition } from '@human-chess/positions';
import { AnalysisBoard } from './AnalysisBoard';
import { GuessTheEval } from './GuessTheEval';
import { SoloRound } from './SoloRound';
import { PvpRound } from './PvpRound';
import { GTE_ANALYSIS_BOARD_KEY, GTE_PVP_KEY, GTE_SOLO_KEY, GTE_TOP_KEY, type AnalysisBoardSnapshot, type PvpSnapshot, type SoloSnapshot, type TopSnapshot } from './snapshot';
import { pvpSecondPlayerLimitMs } from './timing';

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

// For the two "a past endAt drives the round into 'evaluating'" scenarios below: this phase
// transition is *supposed* to trigger the real evaluate effect (unlike stubEngine's scenarios,
// where the restored phase itself should never call the engine at all). `analyse` is still never
// allowed to resolve or reject within these tests — nothing here awaits it — so no wasm/engine
// work actually happens; only the call count matters, to prove the transition happens once, not
// in a loop.
function pendingEngine(): { engine: UciEngine; analyseCalls: () => number } {
  const analyse = vi.fn(() => new Promise(() => undefined));
  return { engine: { analyse, stop: () => undefined } as unknown as UciEngine, analyseCalls: () => analyse.mock.calls.length };
}

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
    // results.length must equal roundIndex (3) before this round's own reveal exists.
    const filler = { truth: SCORE, guessCp: 0, points: 0, timedOut: false, recipeDescription: 'filler' };
    const snap: SoloSnapshot = {
      position: POSITION,
      phase: 'guessing',
      guessCp: 170,
      timedOut: false,
      roundIndex: 3,
      results: [filler, filler, filler],
      endAt: undefined,
      analysis: undefined,
    };
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
    // results.length must equal ROUNDS (5) at the terminal 'summary' screen — the other three
    // rounds are scoreless filler so the asserted total stays "11 / 25000".
    const filler = { truth: SCORE, guessCp: 0, points: 0, timedOut: false, recipeDescription: 'filler' };
    const snap: SoloSnapshot = {
      position: undefined,
      phase: 'summary',
      guessCp: 0,
      timedOut: false,
      roundIndex: 4,
      results: [
        { truth: SCORE, guessCp: 100, points: 8, timedOut: false, recipeDescription: 'one' },
        { truth: SCORE, guessCp: 250, points: 3, timedOut: true, recipeDescription: 'two' },
        filler,
        filler,
        filler,
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
      // results.length must equal roundIndex (1) before this round's own reveal exists.
      results: [
        {
          fen: POSITION.fen,
          lastMove: undefined,
          truth: SCORE,
          guess1Cp: 50,
          guess2Cp: 40,
          points1: 6,
          points2: 5,
          timedOut1: false,
          timedOut2: false,
          recipeDescription: POSITION.description,
        },
      ],
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
    // results.length must equal ROUNDS (5) at the terminal 'results' screen (advance() leaves
    // roundIndex at ROUNDS - 1 rather than incrementing past it) — the other four rounds are
    // scoreless filler so the asserted total stays "8 to 2".
    const filler = {
      fen: POSITION.fen,
      lastMove: undefined,
      truth: SCORE,
      guess1Cp: 0,
      guess2Cp: 0,
      points1: 0,
      points2: 0,
      timedOut1: false,
      timedOut2: false,
      recipeDescription: POSITION.description,
    };
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
        filler,
        filler,
        filler,
        filler,
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

// The hot-loop review fix (item 1): an analysis-failure handler used to bounce `phase` back to
// 'guessing' without touching `endAt`, so a restored, already-expired clock kept re-firing
// onExpire forever. These scenarios mount straight into a 'guessing' phase whose `endAt` is
// already in the past — the same shape a tab-was-away reload produces — and check the round
// lands cleanly on 'evaluating', once, rather than looping.
describe('SoloRound: a restored clock already past its endAt locks in exactly once', () => {
  it('lands on evaluating + timedOut without bouncing back to guessing', () => {
    const { engine, analyseCalls } = pendingEngine();
    const snap: SoloSnapshot = { position: POSITION, phase: 'guessing', guessCp: 150, timedOut: false, roundIndex: 0, results: [], endAt: Date.now() - 5_000, analysis: undefined };
    localStorage.setItem(GTE_SOLO_KEY, JSON.stringify(snap));
    render(createElement(StrictMode, null, createElement(SoloRound, { engine, timeLimitSec: 30, onExit: () => undefined })));
    const stored = JSON.parse(localStorage.getItem(GTE_SOLO_KEY)!) as SoloSnapshot;
    expect(stored.phase).toBe('evaluating');
    expect(stored.timedOut).toBe(true);
    // Exactly one analyse() call: no re-arm-and-retry loop, and StrictMode's double effect
    // invocation did not double-fire the timeout either.
    expect(analyseCalls()).toBe(1);
    expect(screen.getByText('Evaluating…')).toBeTruthy();
  });
});

describe('PvpRound: a restored clock already past its endAt locks in exactly once, never twice', () => {
  it("player 1's expired clock hands over to player 2 without corrupting the recorded guess", () => {
    const snap: PvpSnapshot = {
      position: POSITION,
      phase: 'guessing',
      roundIndex: 0,
      results: [],
      endAt: Date.now() - 5_000,
      analysis: undefined,
      turnPlayer: 1,
      sliderCp: 180,
      guess1Cp: 0,
      guess1UsedMs: 0,
      timedOut1: false,
      timedOut2: false,
      analysingIndex: undefined,
    };
    localStorage.setItem(GTE_PVP_KEY, JSON.stringify(snap));
    render(createElement(StrictMode, null, createElement(PvpRound, { engine: stubEngine, player1: 'Alice', player2: 'Bo', limitSec: 30, onExit: () => undefined })));
    const stored = JSON.parse(localStorage.getItem(GTE_PVP_KEY)!) as PvpSnapshot;
    // Exactly one lock-in: guess1Cp is the sliderCp that was actually on screen (180), not
    // silently overwritten or re-derived by a second call; turnPlayer advanced to 2 once, not
    // bounced further; timedOut1 recorded once.
    expect(stored.phase).toBe('handover');
    expect(stored.guess1Cp).toBe(180);
    expect(stored.turnPlayer).toBe(2);
    expect(stored.timedOut1).toBe(true);
    expect(stored.sliderCp).toBe(0);
    expect(screen.getByText('Pass the device to Bo.')).toBeTruthy();
  });

  it("player 2's expired clock lands on evaluating + timedOut2 without bouncing back to guessing", () => {
    const { engine, analyseCalls } = pendingEngine();
    const snap: PvpSnapshot = {
      position: POSITION,
      phase: 'guessing',
      roundIndex: 0,
      results: [],
      endAt: Date.now() - 5_000,
      analysis: undefined,
      turnPlayer: 2,
      sliderCp: 90,
      guess1Cp: 150,
      guess1UsedMs: 6_000,
      timedOut1: false,
      timedOut2: false,
      analysingIndex: undefined,
    };
    localStorage.setItem(GTE_PVP_KEY, JSON.stringify(snap));
    render(createElement(StrictMode, null, createElement(PvpRound, { engine, player1: 'Alice', player2: 'Bo', limitSec: 30, onExit: () => undefined })));
    const stored = JSON.parse(localStorage.getItem(GTE_PVP_KEY)!) as PvpSnapshot;
    expect(stored.phase).toBe('evaluating');
    expect(stored.timedOut2).toBe(true);
    // guess1Cp (player 1's already-recorded guess) is untouched by player 2's lock-in.
    expect(stored.guess1Cp).toBe(150);
    expect(analyseCalls()).toBe(1);
    expect(screen.getByText('Evaluating…')).toBeTruthy();
  });

  it("restores player 2's clock from pvpSecondPlayerLimitMs, not the full shared limit", () => {
    const limitSec = 30;
    const guess1UsedMs = 4_000;
    // player 2's real limit is min(30s, 4s + the 10s cushion) = 14s, well under the shared 30s.
    const activeLimitMs = pvpSecondPlayerLimitMs(limitSec, guess1UsedMs);
    expect(activeLimitMs).toBe(14_000);
    // endAt is far enough in the future that a countdown using the full 30s limit (unclamped)
    // would show ~25s left, while one correctly using the computed 14s limit clamps to ~14s —
    // this is what distinguishes "restored the right limit" from "restored the wrong one".
    const snap: PvpSnapshot = {
      position: POSITION,
      phase: 'guessing',
      roundIndex: 0,
      results: [],
      endAt: Date.now() + 25_000,
      analysis: undefined,
      turnPlayer: 2,
      sliderCp: 0,
      guess1Cp: 150,
      guess1UsedMs,
      timedOut1: false,
      timedOut2: false,
      analysingIndex: undefined,
    };
    localStorage.setItem(GTE_PVP_KEY, JSON.stringify(snap));
    render(createElement(PvpRound, { engine: stubEngine, player1: 'Alice', player2: 'Bo', limitSec, onExit: () => undefined }));
    expect(screen.getByText('14s left')).toBeTruthy();
    expect(screen.queryByText('25s left')).toBeNull();
  });
});

describe('AnalysisBoard: a persisted history restores the in-progress analysis, not a fresh board', () => {
  it('restores every played move, with Undo available', () => {
    const movedFen = '8/8/8/8/8/8/K7/7k b - - 1 1';
    const snap: AnalysisBoardSnapshot = { seedFen: POSITION.fen, history: [{ fen: POSITION.fen }, { fen: movedFen, lastMove: ['a1', 'a2'] }] };
    localStorage.setItem(GTE_ANALYSIS_BOARD_KEY, JSON.stringify(snap));
    render(createElement(AnalysisBoard, { engine: undefined, initialFen: POSITION.fen, title: 'Guess the eval — analysis', onBack: () => undefined }));
    // A fresh mount would seed a single-entry history and disable Undo; restoring the two-entry
    // history above is what enables it.
    expect(screen.getByText('Undo')).not.toHaveProperty('disabled', true);
    expect(JSON.parse(localStorage.getItem(GTE_ANALYSIS_BOARD_KEY)!)).toEqual(snap);
  });
});
