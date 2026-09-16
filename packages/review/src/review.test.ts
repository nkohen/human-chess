import { describe, expect, it } from 'vitest';
import type { Analysis, Score } from '@human-chess/engine';
import { classify, terminalScore } from './classify';
import { reviewGame, type AnalysingEngine, type ReviewProgress } from './review';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface ScriptedResponse {
  bestmove: string;
  scoreCp?: number;
  scoreMate?: number;
}

/** A fake engine implementing just the `analyse` surface reviewGame calls, answering with one
 * scripted response per call in order (reviewGame's calls are deterministic and sequential, so
 * call order is enough — no need to parse or match on the fen). */
function scriptedEngine(responses: ScriptedResponse[]): { engine: AnalysingEngine; calls: string[] } {
  const calls: string[] = [];
  let next = 0;
  const engine: AnalysingEngine = {
    analyse(fen) {
      calls.push(fen);
      const r = responses[next++];
      if (!r) throw new Error(`scriptedEngine: no response scripted for call ${next}`);
      const score: Score = r.scoreMate !== undefined ? { type: 'mate', value: r.scoreMate } : { type: 'cp', value: r.scoreCp ?? 0 };
      const analysis: Analysis = {
        engine: 'FakeEngine',
        fen,
        moves: [],
        limit: { depth: 6 },
        multipv: 1,
        bestmove: r.bestmove,
        lines: [{ multipv: 1, depth: 6, score, pv: [r.bestmove] }],
        elapsedMs: 1,
      };
      return Promise.resolve(analysis);
    },
  };
  return { engine, calls };
}

describe('reviewGame', () => {
  it("reviews Fool's mate (f3 e5 g4 Qh4#), flipping perspective per ply and classifying each move", async () => {
    const ucis = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    const { engine, calls } = scriptedEngine([
      { bestmove: 'f2f3', scoreCp: 0 }, // fen0 (white to move): matches ply 1 -> best
      { bestmove: 'd7d5', scoreCp: 20 }, // fen1 (black to move): ply 2 not best
      { bestmove: 'd2d4', scoreCp: 350 }, // fen2 (white to move): ply 3 not best
      { bestmove: 'g8f6', scoreCp: -200 }, // fen3 (black to move): ply 4 not best
    ]);

    const progress: ReviewProgress[] = [];
    const review = await reviewGame(engine, { startFen: START_FEN, ucis }, { depth: 6 }, p => progress.push(p));

    // Qh4# leaves White with no legal move, so the final position is never sent to the engine.
    expect(calls).toHaveLength(4);
    expect(progress).toEqual([
      { ply: 1, total: 4 },
      { ply: 2, total: 4 },
      { ply: 3, total: 4 },
      { ply: 4, total: 4 },
    ]);
    expect(review.end).toEqual({ ply: 4, end: { kind: 'checkmate', winner: 'black' } });
    expect(review.moves).toHaveLength(4);

    const [m1, m2, m3, m4] = review.moves;

    expect(m1!.classification).toBe('best');
    expect(m1!.lossCp).toBe(0);
    expect(m1!.bestMove).toBe('f2f3');

    // Black-perspective +20 at fen1 flips to White-perspective -20.
    expect(m2!.evalBefore).toEqual({ type: 'cp', value: -20 });
    expect(m2!.bestSan).toBe('d5');
    expect(m2!.classification).toBe('blunder');
    expect(m2!.lossCp).toBe(370);

    expect(m3!.classification).toBe('mistake');
    expect(m3!.lossCp).toBe(150);

    // Black delivers checkmate: the terminal position has no eval to search, so evalAfterPlayed
    // is the rules-verified mate score, and cp loss is undefined rather than invented.
    expect(m4!.evalAfterPlayed).toEqual({ type: 'mate', value: 0 });
    expect(m4!.lossCp).toBeUndefined();
    expect(m4!.classification).toBe('good');

    for (const move of review.moves) {
      expect(move.provenance).toEqual({ engine: 'FakeEngine', depth: 6 });
    }
  });

  it('reports evalAfterBest equal to evalBefore (no second analyse call for the best line)', async () => {
    const { engine } = scriptedEngine([
      { bestmove: 'e2e4', scoreCp: 15 },
      { bestmove: 'e7e5', scoreCp: -10 },
      { bestmove: 'g1f3', scoreCp: 12 }, // final analyse() after e7e5, since that position isn't game-over
    ]);
    const review = await reviewGame(engine, { startFen: START_FEN, ucis: ['e2e4', 'e7e5'] }, { depth: 4 });
    expect(review.moves[0]!.evalAfterBest).toEqual(review.moves[0]!.evalBefore);
  });
});

describe('classify', () => {
  const white = 'white' as const;

  it('is "best" whenever the played move matches the engine bestmove, regardless of score', () => {
    const result = classify({
      mover: white,
      isBest: true,
      evalAfterBest: { type: 'cp', value: -900 },
      evalAfterPlayed: { type: 'cp', value: -900 },
    });
    expect(result).toEqual({ lossCp: 0, classification: 'best' });
  });

  it('is "good" just under the 30cp threshold', () => {
    const result = classify({
      mover: white,
      isBest: false,
      evalAfterBest: { type: 'cp', value: 50 },
      evalAfterPlayed: { type: 'cp', value: 21 },
    });
    expect(result).toEqual({ lossCp: 29, classification: 'good' });
  });

  it('classifies a lost forced mate as "mate-lost", not a cp bucket', () => {
    const result = classify({
      mover: white,
      isBest: false,
      evalAfterBest: { type: 'mate', value: 4 }, // White had a forced mate
      evalAfterPlayed: { type: 'cp', value: 500 }, // still winning, but the mate is gone
    });
    expect(result).toEqual({ lossCp: undefined, classification: 'mate-lost' });
  });

  it('classifies allowing an opponent mate as "mate-allowed"', () => {
    const result = classify({
      mover: white,
      isBest: false,
      evalAfterBest: { type: 'cp', value: 40 }, // White was fine
      evalAfterPlayed: { type: 'mate', value: -3 }, // now Black forces mate
    });
    expect(result).toEqual({ lossCp: undefined, classification: 'mate-allowed' });
  });

  it('clamps a negative raw difference (search noise) to zero rather than reporting a gain', () => {
    const result = classify({
      mover: white,
      isBest: false,
      evalAfterBest: { type: 'cp', value: 10 },
      evalAfterPlayed: { type: 'cp', value: 25 },
    });
    expect(result.lossCp).toBe(0);
  });
});

describe('terminalScore', () => {
  it('is mate 0 for a checkmate (direction lives in GameEnd.winner, not the score)', () => {
    expect(terminalScore({ kind: 'checkmate', winner: 'black' })).toEqual({ type: 'mate', value: 0 });
  });

  it('is cp 0 for a rules-verified draw', () => {
    expect(terminalScore({ kind: 'stalemate' })).toEqual({ type: 'cp', value: 0 });
    expect(terminalScore({ kind: 'insufficient-material' })).toEqual({ type: 'cp', value: 0 });
    expect(terminalScore({ kind: 'fifty-moves' })).toEqual({ type: 'cp', value: 0 });
  });
});
