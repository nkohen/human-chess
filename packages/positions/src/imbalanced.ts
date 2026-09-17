// Imbalanced middlegame positions for the Chessitout solo loop (memory/subprojects/chessitout-variant.md):
// a self-play position, mined deeper into the middlegame, with a material imbalance and a real
// eval edge for one side — a stand-in for "non-obvious slight edge" (band tuned by the user,
// 2026-09-17; the stricter positional-imbalance definition is on hold, see chessitout-variant.md).
// Every filter reads either real chessops board state (pieceCounts) or a real engine Analysis
// (A1) — nothing here invents a position or a verdict.
import type { Score, UciEngine } from '@human-chess/engine';
import { whitePerspective } from '@human-chess/engine';
import { pieceCounts, positionFromFen, turn, type Color, type Role } from '@human-chess/rules';
import { generateSelfPlayPosition } from './selfPlay';

// Exported so recipes.ts can compute RECIPE_PLY_RANGES for 'imbalanced' from the same numbers
// used here, rather than duplicating them.
export const RANDOM_PLIES = 8;
export const ENGINE_PLIES = 18;
// Mined positions land around ply 26 (RANDOM_PLIES + ENGINE_PLIES), deeper into the middlegame
// than the app's original ply-18 default (user, 2026-09-17).
const MINE_DEPTH = 8;
const EVAL_DEPTH = 18;

// The user's band (user, 2026-09-17): a real edge for one side, not a coin-flip position and not
// a rout — 1 to 3.5 pawns (100 to 350 centipawns), White's perspective, read at the depth-18
// confirming search below.
export const MIN_ABS_EVAL_CP = 100;
export const MAX_ABS_EVAL_CP = 350;

// Cheap pre-screen before the expensive depth-18 confirm: a depth-10 look at the same position,
// generously wide of the real band so a position that will land inside it at depth 18 is very
// unlikely to be screened out by shallow-search noise, while a position nowhere near the band
// (dead equal, or already a rout) is skipped before paying for a depth-18 search on it.
const PRESCREEN_DEPTH = 10;
const PRESCREEN_MIN_ABS_EVAL_CP = 50;
const PRESCREEN_MAX_ABS_EVAL_CP = 500;

export const MAX_ATTEMPTS = 40;

export interface ImbalancedPositionEval {
  /** White's perspective. */
  score: Score;
  engine: string;
  depth: number;
}

export interface ImbalancedPosition {
  fen: string;
  source: 'engine-self-play-imbalanced';
  moves: string[];
  eval: ImbalancedPositionEval;
}

export interface ImbalancedPositionOpts {
  random?: () => number;
  /** Aborts generation; see SelfPlayOpts.signal for the contract. Checked before every mining
   * attempt and before each eval-check engine call. */
  signal?: AbortSignal;
  /** Called at the start of every mining attempt with the 1-based attempt number and
   * MAX_ATTEMPTS, so a caller can show mining progress — mining can take a while at these
   * depths. */
  onProgress?: (attempt: number, maxAttempts: number) => void;
}

/** True when the two sides' piece counts are not an identical vector across every role. */
function isMaterialImbalanced(counts: Record<Color, Record<Role, number>>): boolean {
  return (Object.keys(counts.white) as Role[]).some(role => counts.white[role] !== counts.black[role]);
}

/**
 * Mines a self-play position (randomPlies 8, enginePlies 18, depth 8 — landing around ply 26)
 * until it has a material imbalance and a confirmed eval, both White's perspective, with
 * MIN_ABS_EVAL_CP <= |cp| <= MAX_ABS_EVAL_CP (100 to 350, i.e. 1 to 3.5 pawns) at depth
 * EVAL_DEPTH (18). Before paying for that depth-18 confirm, a cheap depth-10 pre-screen
 * (PRESCREEN_DEPTH) skips any candidate outside a generous 50-500 cp window, to keep mining time
 * sane. Retries up to MAX_ATTEMPTS (40) times; throws rather than loop forever or fabricate a
 * position.
 */
export async function generateImbalancedPosition(
  engine: UciEngine,
  opts: ImbalancedPositionOpts = {},
): Promise<ImbalancedPosition> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    opts.onProgress?.(attempt, MAX_ATTEMPTS);
    opts.signal?.throwIfAborted();
    const selfPlay = await generateSelfPlayPosition(engine, {
      randomPlies: RANDOM_PLIES,
      enginePlies: ENGINE_PLIES,
      depth: MINE_DEPTH,
      ...(opts.random ? { random: opts.random } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    const pos = positionFromFen(selfPlay.fen);
    if (!isMaterialImbalanced(pieceCounts(pos))) continue;

    opts.signal?.throwIfAborted();
    const prescreen = await engine.analyse(selfPlay.fen, [], { depth: PRESCREEN_DEPTH });
    const prescreenLine = prescreen.lines[0];
    if (!prescreenLine) continue;
    const prescreenScore = whitePerspective(prescreenLine.score, turn(pos));
    if (
      prescreenScore.type !== 'cp' ||
      Math.abs(prescreenScore.value) < PRESCREEN_MIN_ABS_EVAL_CP ||
      Math.abs(prescreenScore.value) > PRESCREEN_MAX_ABS_EVAL_CP
    ) {
      continue;
    }

    opts.signal?.throwIfAborted();
    const analysis = await engine.analyse(selfPlay.fen, [], { depth: EVAL_DEPTH });
    const line = analysis.lines[0];
    if (!line) continue;
    const score = whitePerspective(line.score, turn(pos));
    if (score.type !== 'cp' || Math.abs(score.value) < MIN_ABS_EVAL_CP || Math.abs(score.value) > MAX_ABS_EVAL_CP) continue;

    return {
      fen: selfPlay.fen,
      source: 'engine-self-play-imbalanced',
      moves: selfPlay.moves,
      eval: { score, engine: analysis.engine, depth: line.depth },
    };
  }
  throw new Error(`no imbalanced position found in ${MAX_ATTEMPTS} attempts`);
}
