// Exercise generation and line formatting for the visualization trainer. Every board-state
// read goes through @human-chess/rules; nothing here judges legality or evaluates a position
// itself (A1). The line to visualize comes from a real engine call, never invented.
import { fenOf, fullmove, playUci, positionFromFen, randomLegalMove, sanLine, START_FEN, turn, type Color } from '@human-chess/rules';

export const INITIAL_FEN = START_FEN;

/** How many random plies from the initial position set up each exercise's start position. */
export const SETUP_PLIES = 8;

/** How many plies of the engine's principal variation are shown as the line to visualize. */
export const LINE_PLIES = 4;

/**
 * A varied start position: `SETUP_PLIES` uniformly random legal moves played from the initial
 * position. Every move is drawn via `randomLegalMove` (a board-state read, never guessed) and
 * played through `playUci`; nothing here judges legality itself.
 */
export function randomStartFen(random: () => number = Math.random): string {
  let pos = positionFromFen(INITIAL_FEN);
  for (let i = 0; i < SETUP_PLIES; i++) {
    const uci = randomLegalMove(pos, random);
    if (!uci) break;
    pos = playUci(pos, uci).pos;
  }
  return fenOf(pos);
}

/** Turn to move and the fullmove number, read off the position via @human-chess/rules — never hand-parsed from the FEN string. */
function fenTurnAndMove(fen: string): { turn: Color; fullmove: number } {
  const pos = positionFromFen(fen);
  return { turn: turn(pos), fullmove: fullmove(pos) };
}

/**
 * Renders a line of SAN moves with move numbers, e.g. "1… Nf6 2. e5 Nd5": a leading black move
 * gets "N…", every white move gets "N.", and a black move right after a shown white move gets
 * no number, following standard SAN move-list notation.
 */
export function formatLine(startFen: string, sans: string[]): string {
  const { turn: startTurn, fullmove } = fenTurnAndMove(startFen);
  let moveNo = fullmove;
  let toMove = startTurn;
  const parts: string[] = [];
  sans.forEach((san, i) => {
    if (i === 0 && toMove === 'black') parts.push(`${moveNo}… ${san}`);
    else if (toMove === 'white') parts.push(`${moveNo}. ${san}`);
    else parts.push(san);
    if (toMove === 'black') moveNo++;
    toMove = toMove === 'white' ? 'black' : 'white';
  });
  return parts.join(' ');
}

/** SAN for a UCI line, via @human-chess/rules (chessops), never hand-derived. */
export function lineSans(startFen: string, ucis: string[]): string[] {
  return sanLine(positionFromFen(startFen), ucis);
}
