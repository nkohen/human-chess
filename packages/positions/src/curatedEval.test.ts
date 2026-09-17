import { describe, expect, it } from 'vitest';
import type { Analysis, SearchLimit, Score, UciEngine } from '@human-chess/engine';
import { curatedMidgames } from './curated';
import { evaluateCuratedMidgame } from './curatedEval';
import { EVAL_DEPTH } from './imbalanced';

/** A fake engine implementing just the `analyse` surface evaluateCuratedMidgame calls — same
 * pattern as packages/review/src/review.test.ts's scriptedEngine, adapted to script one score. */
function fakeEngine(opts: {
  score?: Score;
  depth?: number;
  noLine?: boolean;
} = {}): { engine: UciEngine; limits: SearchLimit[] } {
  const limits: SearchLimit[] = [];
  const engine = {
    analyse(fen: string, _moves: string[], limit: SearchLimit): Promise<Analysis> {
      limits.push(limit);
      const analysis: Analysis = {
        engine: 'FakeEngine 1.0',
        fen,
        moves: [],
        limit: { ...limit },
        multipv: 1,
        bestmove: 'e2e4',
        lines: opts.noLine ? [] : [{ multipv: 1, depth: opts.depth ?? limit.depth ?? EVAL_DEPTH, score: opts.score ?? { type: 'cp', value: 120 }, pv: ['e2e4'] }],
        elapsedMs: 1,
      };
      return Promise.resolve(analysis);
    },
  } as unknown as UciEngine;
  return { engine, limits };
}

const midgame = curatedMidgames[0]!;

describe('evaluateCuratedMidgame', () => {
  it('analyses at EVAL_DEPTH and returns an ImbalancedPosition with source curated-user-game and no moves', async () => {
    const { engine, limits } = fakeEngine({ score: { type: 'cp', value: 150 } });
    const result = await evaluateCuratedMidgame(engine, midgame);

    expect(result.fen).toBe(midgame.fen);
    expect(result.source).toBe('curated-user-game');
    expect(result.moves).toEqual([]);
    expect(result.eval.engine).toBe('FakeEngine 1.0');
    expect(limits[0]).toEqual({ depth: EVAL_DEPTH });
  });

  it("converts the engine's side-to-move score to White's perspective", async () => {
    // midgame.fen has White to move ("w" in the fen below); pick an entry with Black to move to
    // exercise the flip.
    const blackToMove = curatedMidgames.find(m => m.fen.includes(' b '));
    expect(blackToMove, 'expected at least one curated midgame with Black to move').toBeDefined();
    const { engine } = fakeEngine({ score: { type: 'cp', value: 200 } }); // Black's own perspective
    const result = await evaluateCuratedMidgame(engine, blackToMove!);
    // Black-to-move engine score of +200 (good for Black) is -200 for White.
    expect(result.eval.score).toEqual({ type: 'cp', value: -200 });
  });

  it('never invents a score: throws when the engine returns no line', async () => {
    const { engine } = fakeEngine({ noLine: true });
    await expect(evaluateCuratedMidgame(engine, midgame)).rejects.toThrow(/no evaluation line/);
  });

  it('rejects immediately on an already-aborted signal, without calling the engine', async () => {
    const controller = new AbortController();
    controller.abort();
    const engine = {
      analyse: () => {
        throw new Error('analyse should not be called once the signal is already aborted');
      },
    } as unknown as UciEngine;
    await expect(evaluateCuratedMidgame(engine, midgame, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
