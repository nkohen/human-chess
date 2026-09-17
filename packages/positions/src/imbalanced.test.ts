import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEngines } from '@human-chess/engine/testing';
import type { UciEngine } from '@human-chess/engine';
import { pieceCounts, positionFromFen, type Role } from '@human-chess/rules';
import { ENGINE_PLIES, generateImbalancedPosition, MAX_ABS_EVAL_CP, MIN_ABS_EVAL_CP, RANDOM_PLIES } from './imbalanced';

// Needs real search depth (8 for mining, 10 for the pre-screen, 18 for the confirming eval) to
// find a genuine imbalance within a bounded number of attempts; the wasm engine in CI is too
// slow for that within a reasonable test time, so this only runs against a native Stockfish
// (STOCKFISH_PATH or /opt/homebrew/bin/stockfish). Skipped, with this note, when neither is
// present. Kept fast on the wasm-only path by simply not running there — there is no separate
// wasm assertion to keep slim.
const native = testEngines().find(e => e.label.startsWith('native'));

describe.skipIf(!native)(
  native ? `generateImbalancedPosition with ${native.label}` : 'generateImbalancedPosition (no native Stockfish found, skipped)',
  () => {
    let engine: UciEngine;
    beforeAll(async () => {
      engine = native!.open();
      await engine.init();
    });
    afterAll(() => engine.quit());

    it('finds a materially imbalanced position with 100 <= |cp| <= 350 at depth 18, in under 30s', async () => {
      const started = Date.now();
      const result = await generateImbalancedPosition(engine);
      expect(Date.now() - started).toBeLessThan(30_000);

      expect(result.source).toBe('engine-self-play-imbalanced');
      const counts = pieceCounts(positionFromFen(result.fen));
      const roles = Object.keys(counts.white) as Role[];
      expect(roles.some(role => counts.white[role] !== counts.black[role])).toBe(true);

      expect(result.eval.score.type).toBe('cp');
      if (result.eval.score.type === 'cp') {
        expect(Math.abs(result.eval.score.value)).toBeGreaterThanOrEqual(MIN_ABS_EVAL_CP);
        expect(Math.abs(result.eval.score.value)).toBeLessThanOrEqual(MAX_ABS_EVAL_CP);
      }
      expect(result.eval.depth).toBeGreaterThanOrEqual(18);

      // Lands around ply 26 (RANDOM_PLIES + ENGINE_PLIES = 8 + 18), deeper into the middlegame
      // than the app's original default (user, 2026-09-17); the last ply can be dropped if it
      // ended the game (generateSelfPlayPosition's contract), so the floor is one ply lower.
      expect(result.moves.length).toBeGreaterThanOrEqual(RANDOM_PLIES + ENGINE_PLIES - 1);
      expect(result.moves.length).toBeLessThanOrEqual(RANDOM_PLIES + ENGINE_PLIES);
    }, 30_000);

    it('reports mining progress once per attempt via onProgress', async () => {
      const calls: Array<[number, number]> = [];
      await generateImbalancedPosition(engine, {
        onProgress: (attempt, maxAttempts) => calls.push([attempt, maxAttempts]),
      });
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0]).toEqual([1, 40]);
      // Attempt numbers are consecutive starting at 1.
      calls.forEach(([attempt, maxAttempts], i) => {
        expect(attempt).toBe(i + 1);
        expect(maxAttempts).toBe(40);
      });
    }, 30_000);
  },
);
