// FEN composition for callers that only have the pieces of a FEN, not the whole string (a board
// editor: a piece placement plus a chosen side to move / castling rights / ep square). Both
// functions here delegate to chessops (parseBoardFen, parseCastlingFen, makeFen); neither
// hand-assembles or hand-parses a FEN string beyond splitting the placement field chessops itself
// already accepts alone.
import { makeFen, parseBoardFen, parseCastlingFen } from 'chessops/fen';
import { parseSquare } from 'chessops/util';
import type { Setup } from 'chessops/setup';
import type { Color, Square, SquareName } from 'chessops/types';
import { RulesError } from './index.js';

/** An empty board's piece-placement field — the starting point for "Clear board". */
export const EMPTY_PLACEMENT_FEN = '8/8/8/8/8/8/8/8';

function squareOf(name: SquareName): Square {
  const square = parseSquare(name);
  if (square === undefined) throw new RulesError(`invalid square "${name}"`);
  return square;
}

/**
 * Builds a full FEN from a piece-placement field plus the fields a board editor knows
 * separately: whose move it is, which castling rights survive, and (optionally) the en-passant
 * target square. Castling letters the placement cannot support are dropped first: chessops'
 * `parseCastlingFen` never rejects them, it falls back to the corner square and `makeFen` then
 * writes Chess960-style file letters ("HAha"), and `positionFromFen` accepts that silently
 * (reviewer finding, 2026-09-16). A caller that needs "is this actually a legal position" still
 * runs `positionFromFen` on the result.
 */
export function composeFen(placement: string, turn: Color, castling: string, epSquare?: SquareName): string {
  const board = parseBoardFen(placement);
  if (board.isErr) throw new RulesError(`invalid piece placement "${placement}": ${board.error.message}`);
  const possible = castlingRightsFor(placement);
  const kept = [...castling].filter(c => possible.includes(c)).join('') || '-';
  const castlingRights = parseCastlingFen(board.value, kept);
  if (castlingRights.isErr) {
    throw new RulesError(`invalid castling rights "${castling}": ${castlingRights.error.message}`);
  }
  const setup: Setup = {
    board: board.value,
    pockets: undefined,
    turn,
    castlingRights: castlingRights.value,
    epSquare: epSquare ? squareOf(epSquare) : undefined,
    remainingChecks: undefined,
    halfmoves: 0,
    fullmoves: 1,
  };
  return makeFen(setup);
}

interface CastlingHome {
  king: SquareName;
  kingRook: SquareName;
  queenRook: SquareName;
  kingSide: string;
  queenSide: string;
}

const CASTLING_HOME: Record<Color, CastlingHome> = {
  white: { king: 'e1', kingRook: 'h1', queenRook: 'a1', kingSide: 'K', queenSide: 'Q' },
  black: { king: 'e8', kingRook: 'h8', queenRook: 'a8', kingSide: 'k', queenSide: 'q' },
};

/**
 * Which of "KQkq" a placement could still support, read straight off the board: a king on its
 * home square plus a rook on the corresponding corner. No string parsing of the placement is
 * involved — every check is a `Board.get` on chessops' own parsed board.
 */
export function castlingRightsFor(placement: string): string {
  const board = parseBoardFen(placement);
  if (board.isErr) throw new RulesError(`invalid piece placement "${placement}": ${board.error.message}`);
  const b = board.value;
  const isPiece = (square: SquareName, color: Color, role: 'king' | 'rook'): boolean => {
    const piece = b.get(squareOf(square));
    return piece !== undefined && piece.color === color && piece.role === role;
  };
  let rights = '';
  for (const color of ['white', 'black'] as const) {
    const home = CASTLING_HOME[color];
    if (!isPiece(home.king, color, 'king')) continue;
    if (isPiece(home.kingRook, color, 'rook')) rights += home.kingSide;
    if (isPiece(home.queenRook, color, 'rook')) rights += home.queenSide;
  }
  return rights;
}
