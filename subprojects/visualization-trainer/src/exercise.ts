// Exercise generation for the visualization trainer. Every board-state read goes through
// @human-chess/rules; nothing here judges legality or evaluates a position itself (A1). The
// line to visualize comes from a real engine call, never invented. Line formatting and
// step-through display live in @human-chess/board's MoveLine component (built on
// @human-chess/rules' annotateLine/formatLine), not here.
import { fenOf, playUci, positionFromFen, randomLegalMove, START_FEN } from '@human-chess/rules';

export const INITIAL_FEN = START_FEN;

/** How many random plies from the initial position set up each exercise's start position. */
export const SETUP_PLIES = 8;

/** How many plies of the engine's principal variation are shown as the line to visualize. */
export const LINE_PLIES = 4;

/** How many exercises make up one session. A first guess, not tuned against real usage yet. */
export const ROUNDS = 5;

/**
 * A varied start position: `SETUP_PLIES` uniformly random legal moves played from the initial
 * position. Every move is drawn via `randomLegalMove` (a board-state read, never guessed) and
 * played through `playUci`; nothing here judges legality itself. Returns the moves played too
 * (`moves`), so a caller showing this position on a board can highlight the real move that
 * produced it rather than showing none or inventing one (A1/V3).
 */
export function randomStartPosition(random: () => number = Math.random): { fen: string; moves: string[] } {
  let pos = positionFromFen(INITIAL_FEN);
  const moves: string[] = [];
  for (let i = 0; i < SETUP_PLIES; i++) {
    const uci = randomLegalMove(pos, random);
    if (!uci) break;
    pos = playUci(pos, uci).pos;
    moves.push(uci);
  }
  return { fen: fenOf(pos), moves };
}

/** `randomStartPosition`'s fen alone, for callers that have no use for the setup moves. */
export function randomStartFen(random: () => number = Math.random): string {
  return randomStartPosition(random).fen;
}
