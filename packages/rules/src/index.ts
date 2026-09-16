// Chess rules and notation: thin wrappers over chessops (GPL-3.0-or-later, lichess).
// This is the only package that imports chessops. Nothing here generates moves or judges
// legality itself; every function delegates to chessops and only reshapes the result.
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { makeSan, makeSanAndPlay } from 'chessops/san';
import { makeSquare, makeUci, opposite as opp, parseSquare, parseUci, squareRank } from 'chessops/util';
import { Board } from 'chessops/board';
import { SquareSet } from 'chessops/squareSet';
import type { Color, Move, Role, SquareName } from 'chessops/types';

export type { Color, Role, SquareName };

/** The standard chess starting position, as FEN. The one literal every start-position caller shares. */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A chess position. Opaque outside this package; use the functions below. */
export type Position = Chess;

export class RulesError extends Error {}

export function positionFromFen(fen: string): Position {
  const setup = parseFen(fen);
  if (setup.isErr) throw new RulesError(`invalid FEN "${fen}": ${setup.error.message}`);
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) throw new RulesError(`illegal position "${fen}": ${pos.error.message}`);
  return pos.value;
}

export const fenOf = (pos: Position): string => makeFen(pos.toSetup());

/** FEN without the move counters; equal keys mean the same position for repetition purposes. */
export const repetitionKey = (pos: Position): string => makeFen(pos.toSetup(), { epd: true });

export const turn = (pos: Position): Color => pos.turn;
export const opposite = (color: Color): Color => opp(color);
export const inCheck = (pos: Position): boolean => pos.isCheck();

/** The fullmove number, read straight off the position (chessops tracks it; never hand-parse a FEN field for it). */
export const fullmove = (pos: Position): number => pos.fullmoves;

/** Legal destinations per origin square, in the shape chessground expects. */
export const legalDests = (pos: Position): Map<SquareName, SquareName[]> => chessgroundDests(pos);

export const hasLegalMoves = (pos: Position): boolean => legalDests(pos).size > 0;

/** True when moving the piece on `from` to `to` would be a pawn reaching the last rank. */
export function isPromotionMove(pos: Position, from: SquareName, to: SquareName): boolean {
  const piece = pos.board.get(parseSquare(from));
  const rank = squareRank(parseSquare(to));
  return piece?.role === 'pawn' && (rank === 0 || rank === 7);
}

export interface Played {
  pos: Position;
  san: string;
  uci: string;
}

/** Plays a UCI move on a copy of the position. Throws RulesError if the move is illegal. */
export function playUci(pos: Position, uci: string): Played {
  const move = parseUci(uci);
  if (!move) throw new RulesError(`unparseable UCI move "${uci}"`);
  return play(pos, move);
}

export function playMove(pos: Position, from: SquareName, to: SquareName, promotion?: Role): Played {
  const move: Move = promotion
    ? { from: parseSquare(from), to: parseSquare(to), promotion }
    : { from: parseSquare(from), to: parseSquare(to) };
  return play(pos, move);
}

function play(pos: Position, move: Move): Played {
  if (!pos.isLegal(move)) throw new RulesError(`illegal move ${makeUci(move)} in ${fenOf(pos)}`);
  const next = pos.clone();
  const san = makeSan(next, move);
  next.play(move);
  return { pos: next, san, uci: makeUci(move) };
}

export type GameEnd =
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'insufficient-material' }
  | { kind: 'fifty-moves' }
  | { kind: 'threefold-repetition' };

/**
 * How the position itself ends the game, if it does. Repetition needs history and is judged
 * by the caller with `repetitionKey`. Checkmate and stalemate come first because they take
 * precedence over the counters.
 */
export function positionEnd(pos: Position): GameEnd | undefined {
  if (pos.isCheckmate()) return { kind: 'checkmate', winner: opp(pos.turn) };
  if (pos.isStalemate()) return { kind: 'stalemate' };
  if (pos.isInsufficientMaterial()) return { kind: 'insufficient-material' };
  if (pos.halfmoves >= 100) return { kind: 'fifty-moves' };
  return undefined;
}

/** The SAN of each move in `ucis`, played in sequence on a clone of `pos`. Throws RulesError on an illegal or unparseable move. */
export function sanLine(pos: Position, ucis: string[]): string[] {
  const clone = pos.clone();
  const sans: string[] = [];
  for (const uci of ucis) {
    const move = parseUci(uci);
    if (!move) throw new RulesError(`unparseable UCI move "${uci}"`);
    if (!clone.isLegal(move)) throw new RulesError(`illegal move ${uci} in ${fenOf(clone)}`);
    sans.push(makeSanAndPlay(clone, move));
  }
  return sans;
}

/** The piece on `square`, or undefined when it is empty. A direct board read, never guessed. */
export function pieceAt(pos: Position, square: SquareName): { color: Color; role: Role } | undefined {
  const piece = pos.board.get(parseSquare(square));
  if (!piece) return undefined;
  return { color: piece.color, role: piece.role };
}

/** The square of `color`'s king. Throws RulesError if the position has none (should not happen for a legal Chess position). */
export function kingSquare(pos: Position, color: Color): SquareName {
  const square = pos.board.kingOf(color);
  if (square === undefined) throw new RulesError(`no ${color} king on the board`);
  return makeSquare(square);
}

/** How many of each role each side has on the board. */
export function pieceCounts(pos: Position): Record<Color, Record<Role, number>> {
  const counts: Record<Color, Record<Role, number>> = {
    white: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 },
    black: { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 },
  };
  for (const [, piece] of pos.board) counts[piece.color][piece.role]++;
  return counts;
}

/** Every occupied square on the board, in no particular order. */
export function occupiedSquares(pos: Position): SquareName[] {
  return [...pos.board].map(([square]) => makeSquare(square));
}

/** A uniformly random legal move as UCI, or undefined when there is none. Reads board state via `legalDests`; picks, does not judge legality. */
export function randomLegalMove(pos: Position, random: () => number = Math.random): string | undefined {
  const dests = legalDests(pos);
  const moves: string[] = [];
  for (const [from, tos] of dests) {
    for (const to of tos) {
      moves.push(isPromotionMove(pos, from, to) ? `${from}${to}q` : `${from}${to}`);
    }
  }
  if (moves.length === 0) return undefined;
  const idx = Math.floor(random() * moves.length);
  return moves[Math.min(idx, moves.length - 1)];
}

/** The same position with the colours swapped and the board flipped, so Black plays White's part. */
export function mirrorColors(pos: Position): Position {
  const setup = pos.toSetup();
  const board = Board.empty();
  for (const [square, piece] of setup.board) {
    board.set(square ^ 56, { role: piece.role, color: opp(piece.color) });
  }
  let castlingRights = SquareSet.empty();
  for (const square of setup.castlingRights) castlingRights = castlingRights.with(square ^ 56);
  const mirrored = Chess.fromSetup({
    ...setup,
    board,
    castlingRights,
    turn: opp(setup.turn),
    epSquare: setup.epSquare === undefined ? undefined : setup.epSquare ^ 56,
  });
  if (mirrored.isErr) throw new RulesError(`mirroring produced an illegal position: ${mirrored.error.message}`);
  return mirrored.value;
}

export * from './roles';
export * from './pgn';
export * from './line';
export * from './fen';
