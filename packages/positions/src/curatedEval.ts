// Real-engine evaluation of a curated user-game position (curated.ts) for Chessitout's
// "From your games" source. Produces the same ImbalancedPosition shape generateImbalancedPosition
// (imbalanced.ts) returns for a mined position, so the rest of the Chessitout flow (vote, play,
// judge) is unchanged regardless of which source picked the position. Reuses imbalanced.ts's
// EVAL_DEPTH and @human-chess/engine's whitePerspective rather than duplicating either. No band
// filter here: unlike mining, the user already picked this position, so there is nothing to
// screen for — the eval shown is simply whatever the engine reports (A1: always a real
// engine.analyse call, never the chess.com-displayed siteEvalShown).
import type { UciEngine } from '@human-chess/engine';
import { whitePerspective } from '@human-chess/engine';
import { positionFromFen, turn } from '@human-chess/rules';
import type { CuratedPosition } from './curated';
import { EVAL_DEPTH, type ImbalancedPosition } from './imbalanced';

export interface EvaluateCuratedMidgameOpts {
  signal?: AbortSignal;
}

/**
 * Analyses `position.fen` at EVAL_DEPTH (18) and returns it as an ImbalancedPosition with
 * source 'curated-user-game' and an empty `moves` list (there is no self-play move history for
 * a curated position — the FEN is the game's own recorded position). Throws, rather than
 * fabricating a score, if the engine returns no evaluation line.
 */
export async function evaluateCuratedMidgame(
  engine: UciEngine,
  position: CuratedPosition,
  opts: EvaluateCuratedMidgameOpts = {},
): Promise<ImbalancedPosition> {
  opts.signal?.throwIfAborted();
  const pos = positionFromFen(position.fen);
  const analysis = await engine.analyse(position.fen, [], { depth: EVAL_DEPTH });
  opts.signal?.throwIfAborted();
  const line = analysis.lines[0];
  if (!line) throw new Error(`${analysis.engine} returned no evaluation line for ${position.fen}`);
  const score = whitePerspective(line.score, turn(pos));
  return {
    fen: position.fen,
    source: 'curated-user-game',
    moves: [],
    eval: { score, engine: analysis.engine, depth: line.depth },
  };
}
