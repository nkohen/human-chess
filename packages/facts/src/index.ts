// Board-state facts that questions are checked against. Every fact here is computed through
// @human-chess/rules (chessops-backed reads); nothing here is a free-form claim about a
// position (V3). Material points are a counting convention, not an evaluation — for a real
// judgement of who stands better, go to the engine (A1).
import {
  inCheck, occupiedSquares, pieceAt, pieceCounts, playUci, positionFromFen, turn,
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
  | { kind: 'material'; prompt: string; answer: number };

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

/** Picks `n` distinct items out of `items` without replacement, using `random` for each draw. */
function pickRandom<T>(items: T[], n: number, random: () => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]!);
  }
  return picked;
}

function checkQuestion(end: Position): Question {
  const side = turn(end);
  return { kind: 'check', prompt: `Is ${side} in check?`, answer: inCheck(end) };
}

function pieceOnQuestion(end: Position, random: () => number): Question {
  const occupied = occupiedSquares(end);
  const occupiedSet = new Set(occupied);
  const empty = ALL_SQUARES.filter(sq => !occupiedSet.has(sq));
  const emptyPicks = pickRandom(empty, 2, random);
  const pool = [...occupied, ...emptyPicks];
  const square = pool[Math.floor(random() * pool.length)]!;
  return { kind: 'piece-on', square, prompt: `What is on ${square}?`, answer: pieceLabel(end, square) };
}

function materialQuestion(end: Position): Question {
  const { balance } = materialPoints(end);
  return {
    kind: 'material',
    prompt:
      'What is the material balance (white minus black, in points)? (standard count: pawn 1, knight 3, bishop 3, rook 5, queen 9)',
    answer: balance,
  };
}

/** Exactly three questions about `end`: whether the side to move is in check, what is on a
 * (mostly random) square, and the material balance. All grounded in @human-chess/rules reads. */
export function questionsFor(end: Position, random: () => number = Math.random): Question[] {
  return [checkQuestion(end), pieceOnQuestion(end, random), materialQuestion(end)];
}
