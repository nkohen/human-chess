// Board-state facts that questions are checked against. Every fact here is computed through
// @human-chess/rules (chessops-backed reads); nothing here is a free-form claim about a
// position (V3). Material points are a counting convention, not an evaluation — for a real
// judgement of who stands better, go to the engine (A1). `questionsFor` takes the line itself
// (start FEN + UCIs), not just the end position, so the piece-on question can be restricted to
// squares the line actually touched and the material question can carry the pre-line balance.
import {
  inCheck, occupiedSquares, pieceAt, pieceCounts, playUci, positionFromFen, turn, uciSquares,
  type Color, type Position, type Role, type SquareName,
} from '@human-chess/rules';

export { type Position } from '@human-chess/rules';

/** Plays `ucis` on the position starting at `startFen`. Throws RulesError on an illegal move. */
export function endPosition(startFen: string, ucis: string[]): Position {
  let pos = positionFromFen(startFen);
  for (const uci of ucis) pos = playUci(pos, uci).pos;
  return pos;
}

/**
 * Standard point count used to compare material at a glance: pawn 1, knight 3, bishop 3,
 * rook 5, queen 9, king 0. This is a convention for a quick tally, not an evaluation of the
 * position — it says nothing about activity, safety, or who is actually better (V3).
 */
export const STANDARD_POINTS: Record<Role, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};

function materialFor(counts: Record<Role, number>): number {
  return (Object.keys(counts) as Role[]).reduce((total, role) => total + counts[role] * STANDARD_POINTS[role], 0);
}

export function materialPoints(pos: Position): { white: number; black: number; balance: number } {
  const counts = pieceCounts(pos);
  const white = materialFor(counts.white);
  const black = materialFor(counts.black);
  return { white, black, balance: white - black };
}

export type Question =
  | { kind: 'check'; prompt: string; answer: boolean }
  | { kind: 'piece-on'; square: SquareName; prompt: string; answer: string }
  | {
      kind: 'material';
      prompt: string;
      answer: number;
      /** The balance before the line is played, so the learner only has to reason about the change. */
      before: { white: number; black: number; balance: number };
    };

const ROLES: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const COLORS: Color[] = ['white', 'black'];
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const ALL_SQUARES: SquareName[] = FILES.flatMap(f => RANKS.map(r => `${f}${r}` as SquareName));

/** Every "<color> <role>" label a piece-on question can answer with, plus "empty". */
export const PIECE_ON_OPTIONS: string[] = ['empty', ...COLORS.flatMap(color => ROLES.map(role => `${color} ${role}`))];

function pieceLabel(pos: Position, square: SquareName): string {
  const piece = pieceAt(pos, square);
  return piece ? `${piece.color} ${piece.role}` : 'empty';
}

/**
 * Every square worth asking "what is on X?" about after playing `ucis` from `startFen`: the
 * from- and to-square of each move in the line, plus every square whose contents differ
 * between the start and end positions. The second half is what catches a castled rook (its
 * own from/to never appears in the king's UCI move) and the square vacated by a pawn taken
 * en passant (never the capturing move's own from/to either). Computed purely from
 * `pieceAt`/`occupiedSquares` reads via @human-chess/rules — never by parsing FEN text.
 */
export function touchedSquares(startFen: string, ucis: string[]): SquareName[] {
  const start = positionFromFen(startFen);
  const end = endPosition(startFen, ucis);
  const squares = new Set<SquareName>();
  for (const uci of ucis) {
    const [from, to] = uciSquares(uci);
    squares.add(from);
    squares.add(to);
  }
  const candidates = new Set([...occupiedSquares(start), ...occupiedSquares(end)]);
  for (const square of candidates) {
    const before = pieceAt(start, square);
    const after = pieceAt(end, square);
    if (before?.color !== after?.color || before?.role !== after?.role) squares.add(square);
  }
  return [...squares];
}

function checkQuestion(end: Position): Question {
  const side = turn(end);
  return { kind: 'check', prompt: `Is ${side} in check?`, answer: inCheck(end) };
}

function pieceOnQuestion(end: Position, touched: SquareName[], random: () => number): Question {
  // touched is empty only in the degenerate case of an empty line (start === end); fall back
  // to the whole board rather than crash, though the app never hits this (a "no line" result
  // is handled before any questions are asked).
  const pool = touched.length > 0 ? touched : ALL_SQUARES;
  const square = pool[Math.floor(random() * pool.length)]!;
  return { kind: 'piece-on', square, prompt: `What is on ${square}?`, answer: pieceLabel(end, square) };
}

function materialQuestion(start: Position, end: Position): Question {
  const before = materialPoints(start);
  const { balance } = materialPoints(end);
  return {
    kind: 'material',
    prompt:
      'After the line, what is the material balance (white minus black, in points)? (standard count: pawn 1, knight 3, bishop 3, rook 5, queen 9)',
    answer: balance,
    before,
  };
}

/** Exactly three questions about the position reached by playing `ucis` from `startFen`: whether
 * the side to move is in check, what is on a square the line actually touched, and the material
 * balance (carrying the pre-line balance too, so a caller can show it). All grounded in
 * @human-chess/rules reads; the end position is computed here via `endPosition`. */
export function questionsFor(startFen: string, ucis: string[], random: () => number = Math.random): Question[] {
  const start = positionFromFen(startFen);
  const end = endPosition(startFen, ucis);
  const touched = touchedSquares(startFen, ucis);
  return [checkQuestion(end), pieceOnQuestion(end, touched, random), materialQuestion(start, end)];
}
