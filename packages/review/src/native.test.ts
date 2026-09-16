// One end-to-end pass against a real engine, guarded to a native binary (fast) rather than the
// wasm build, and kept under a 15s budget as the task asked; skipped (with a note why) when no
// native Stockfish is configured, rather than silently passing on the fake-engine tests alone.
import { describe, expect, it } from 'vitest';
import { testEngines } from '@human-chess/engine/testing';
import { reviewGame } from './review';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const nativeEngines = testEngines().filter(e => e.label.startsWith('native'));

if (nativeEngines.length === 0) {
  // eslint-disable-next-line no-console
  console.warn(
    'review/native.test.ts: skipped — no native Stockfish found (set STOCKFISH_PATH or install to /opt/homebrew/bin/stockfish).',
  );
}

describe.skipIf(nativeEngines.length === 0)('reviewGame against a native engine', () => {
  it('reviews a real 6-ply game (Ruy Lopez) end-to-end at depth 6, within 15s', async () => {
    const engine = nativeEngines[0]!.open();
    await engine.init();
    try {
      const ucis = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'];
      const review = await reviewGame(engine, { startFen: START_FEN, ucis }, { depth: 6 });

      expect(review.moves).toHaveLength(6);
      expect(review.end).toBeUndefined();
      const classifications: string[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder', 'mate-lost', 'mate-allowed'];
      for (const move of review.moves) {
        expect(move.provenance.engine.toLowerCase()).toContain('stockfish');
        expect(move.provenance.depthBefore).toBeGreaterThanOrEqual(6);
        expect(classifications).toContain(move.classification);
      }
    } finally {
      engine.quit();
    }
  }, 15_000);
});
