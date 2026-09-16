// A generated position: play a few random opening plies, then let an engine play both sides
// for a while. Not a curated lesson — a fresh, ungraded position for a subproject (guess-the-eval)
// that needs many positions rather than a hand-picked few. Every ply is either a board-state
// random draw (`randomLegalMove`) or a real engine move (`bestMove`); nothing here fabricates
// a position or a move (A1).
import type { UciEngine } from '@human-chess/engine';
import { fenOf, playUci, positionEnd, positionFromFen, randomLegalMove, START_FEN, type Position } from '@human-chess/rules';

export interface SelfPlayPosition {
  fen: string;
  source: 'engine-self-play';
  moves: string[];
}

export interface SelfPlayOpts {
  /** Uniformly random legal moves played from the start position. Default 6. */
  randomPlies?: number;
  /** Engine best moves played after the random plies. Default 14. */
  enginePlies?: number;
  /** Search depth for the engine's own moves during self-play. Default 6. */
  depth?: number;
  random?: () => number;
  /** Uniformly random legal moves played after the engine plies. Default 0. Used by the "sharp"
   * recipe (recipes.ts) instead of duplicating this loop there. */
  trailingRandomPlies?: number;
  /** Aborts generation: checked before every engine call and every random-ply draw, throwing an
   * AbortError (via AbortSignal.throwIfAborted) rather than letting a superseded generation run
   * to completion (A1 — no result from an aborted call is ever used). */
  signal?: AbortSignal;
}

/**
 * Plays `randomPlies` random legal moves from the start position, then `enginePlies` engine
 * best moves, then `trailingRandomPlies` more random legal moves. Never returns a finished
 * position: if the last move played (from any of the three stages) ended the game, that move is
 * dropped and the position before it is returned (it had a legal move, so it is not game-over).
 */
export async function generateSelfPlayPosition(engine: UciEngine, opts: SelfPlayOpts = {}): Promise<SelfPlayPosition> {
  const randomPlies = opts.randomPlies ?? 6;
  const enginePlies = opts.enginePlies ?? 14;
  const depth = opts.depth ?? 6;
  const trailingRandomPlies = opts.trailingRandomPlies ?? 0;
  const signal = opts.signal;

  signal?.throwIfAborted();

  let pos: Position = positionFromFen(START_FEN);
  let before: Position = pos;
  const moves: string[] = [];

  for (let i = 0; i < randomPlies && !positionEnd(pos); i++) {
    signal?.throwIfAborted();
    const uci = randomLegalMove(pos, opts.random);
    if (!uci) break;
    before = pos;
    pos = playUci(pos, uci).pos;
    moves.push(uci);
  }

  for (let i = 0; i < enginePlies && !positionEnd(pos); i++) {
    signal?.throwIfAborted();
    const { move } = await engine.bestMove(fenOf(pos), [], { depth });
    before = pos;
    pos = playUci(pos, move).pos;
    moves.push(move);
  }

  for (let i = 0; i < trailingRandomPlies && !positionEnd(pos); i++) {
    signal?.throwIfAborted();
    const uci = randomLegalMove(pos, opts.random);
    if (!uci) break;
    before = pos;
    pos = playUci(pos, uci).pos;
    moves.push(uci);
  }

  if (positionEnd(pos)) {
    pos = before;
    moves.pop();
  }
  return { fen: fenOf(pos), source: 'engine-self-play', moves };
}
