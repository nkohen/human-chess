import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testEngines } from '@human-chess/engine/testing';
import type { UciEngine } from '@human-chess/engine';
import { pieceCounts, positionFromFen, type Role } from '@human-chess/rules';
import { generateImbalancedPosition } from './imbalanced';

// Needs real search depth (6 for mining, 10 for the eval check) to find a genuine imbalance
// within a bounded number of attempts; the wasm engine in CI is too slow for that within a
// reasonable test time, so this only runs against a native Stockfish (STOCKFISH_PATH or
// /opt/homebrew/bin/stockfish). Skipped, with this note, when neither is present.
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

    it('finds a materially imbalanced position with |cp| <= 150 at depth 10, in under 20s', async () => {
      const started = Date.now();
      const result = await generateImbalancedPosition(engine);
      expect(Date.now() - started).toBeLessThan(20_000);

      expect(result.source).toBe('engine-self-play-imbalanced');
      const counts = pieceCounts(positionFromFen(result.fen));
      const roles = Object.keys(counts.white) as Role[];
      expect(roles.some(role => counts.white[role] !== counts.black[role])).toBe(true);

      expect(result.eval.score.type).toBe('cp');
      if (result.eval.score.type === 'cp') {
        expect(Math.abs(result.eval.score.value)).toBeLessThanOrEqual(150);
      }
      expect(result.eval.depth).toBeGreaterThanOrEqual(10);
    });
  },
);
