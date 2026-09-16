// One engine test, native only (the task caps it at 10s and the wasm build can be slower than
// that under multipv 3 at depth 14 in CI). If no native Stockfish is present (no STOCKFISH_PATH
// and no /opt/homebrew/bin/stockfish), `native` is empty and this suite has nothing to run —
// vitest reports it as no tests found for this file rather than a failure.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { UciEngine } from '@human-chess/engine';
import { testEngines } from '@human-chess/engine/testing';

const native = testEngines().filter(e => e.label.startsWith('native'));

describe.each(native)('MultiPV panel query against $label', ({ open }) => {
  let engine: UciEngine;
  beforeAll(async () => {
    engine = open();
    await engine.init();
  });
  afterAll(() => engine.quit());

  it('returns 3 lines with distinct first moves at the start position, under 10s', async () => {
    const started = Date.now();
    const a = await engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [], { depth: 14 }, 3);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(a.lines).toHaveLength(3);
    const firstMoves = new Set(a.lines.map(l => l.pv[0]));
    expect(firstMoves.size).toBe(3);
  }, 10_000);
});
