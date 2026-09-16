// Imbalanced middlegame positions for the Chessitout solo loop (memory/subprojects/chessitout-variant.md):
// a self-play position with a material imbalance and a small eval swing, as a stand-in for
// "non-obvious slight edge" until the user tunes the bands. Every filter reads either real
// chessops board state (pieceCounts) or a real engine Analysis (A1) — nothing here invents a
// position or a verdict.
import type { Score, UciEngine } from '@human-chess/engine';
import { whitePerspective } from '@human-chess/engine';
import { pieceCounts, positionFromFen, turn, type Color, type Role } from '@human-chess/rules';
import { generateSelfPlayPosition } from './selfPlay';

const RANDOM_PLIES = 8;
const ENGINE_PLIES = 10;
const MINE_DEPTH = 6;
const EVAL_DEPTH = 10;
// First-guess bands, not yet tuned by the user: a "non-obvious slight edge" is read here as a
// small eval swing (|cp| at or under this) that still comes with a real material imbalance,
// rather than either a dead-equal position or an obviously winning one.
const MAX_ABS_EVAL_CP = 150;
const MAX_ATTEMPTS = 12;

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
}

/** True when the two sides' piece counts are not an identical vector across every role. */
function isMaterialImbalanced(counts: Record<Color, Record<Role, number>>): boolean {
  return (Object.keys(counts.white) as Role[]).some(role => counts.white[role] !== counts.black[role]);
}

/**
 * Mines a self-play position (randomPlies 8, enginePlies 10, depth 6) until it has a material
 * imbalance and a depth-10 eval within MAX_ABS_EVAL_CP of equal, both White's perspective.
 * Retries up to MAX_ATTEMPTS times; throws rather than loop forever or fabricate a position.
 */
export async function generateImbalancedPosition(
  engine: UciEngine,
  opts: ImbalancedPositionOpts = {},
): Promise<ImbalancedPosition> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const selfPlay = await generateSelfPlayPosition(engine, {
      randomPlies: RANDOM_PLIES,
      enginePlies: ENGINE_PLIES,
      depth: MINE_DEPTH,
      ...(opts.random ? { random: opts.random } : {}),
    });
    const pos = positionFromFen(selfPlay.fen);
    if (!isMaterialImbalanced(pieceCounts(pos))) continue;

    const analysis = await engine.analyse(selfPlay.fen, [], { depth: EVAL_DEPTH });
    const line = analysis.lines[0];
    if (!line) continue;
    const score = whitePerspective(line.score, turn(pos));
    if (score.type !== 'cp' || Math.abs(score.value) > MAX_ABS_EVAL_CP) continue;

    return {
      fen: selfPlay.fen,
      source: 'engine-self-play-imbalanced',
      moves: selfPlay.moves,
      eval: { score, engine: analysis.engine, depth: line.depth },
    };
  }
  throw new Error(`no imbalanced position found in ${MAX_ATTEMPTS} attempts`);
}
