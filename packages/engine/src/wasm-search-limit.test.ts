// A time-capped search is the fix for the game reviewer's "no answer to go depth 20 within
// 65000 ms" failure (memory/subprojects/game-reviewer.md, Timing 2026-09-17): with `movetime`
// set alongside `depth`, the engine must stop at whichever limit comes first rather than
// running the wasm engine's single thread to full depth 20+ on a hard position. Runs against the
// wasm build specifically (not the native fallback in testEngines()) since that is the engine
// the failure was reported against; the wasm engine is a hard install dependency, so unlike
// packages/review/src/native.test.ts there is nothing to skip on.
import { describe, expect, it } from 'vitest';
import { testEngines } from './testing';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const wasmEngines = testEngines().filter(e => e.label.startsWith('stockfish wasm'));

describe('UciEngine.analyse with depth + movetime, against the wasm engine', () => {
  it('resolves well under 5s at movetime 300ms even with depth 40 requested, reporting the depth actually reached', async () => {
    const engine = wasmEngines[0]!.open();
    await engine.init();
    try {
      const started = Date.now();
      const a = await engine.analyse(START_FEN, [], { depth: 40, movetime: 300 });
      const elapsedMs = Date.now() - started;

      expect(elapsedMs).toBeLessThan(5000);
      expect(a.bestmove).toMatch(/^[a-h][1-8][a-h][1-8]$/);
      // The requested depth is a ceiling, not a promise: movetime cut the search off first (the
      // single-threaded wasm engine cannot reach depth 40 in 300 ms), so the reported depth (the
      // only depth provenance may ever claim) is whatever was actually reached.
      expect(a.lines[0]?.depth).toBeGreaterThan(0);
      expect(a.lines[0]?.depth).toBeLessThan(40);
      expect(a.limit).toEqual({ depth: 40, movetime: 300 });
    } finally {
      engine.quit();
    }
  }, 8000);
});
