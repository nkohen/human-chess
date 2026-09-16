import { describe, expect, it } from 'vitest';
import {
  fenOf, isPromotionMove, legalDests, mirrorColors, playMove, playUci, positionEnd,
  positionFromFen, randomLegalMove, repetitionKey, RulesError, sanLine, turn,
kingSquare, occupiedSquares, pieceAt, pieceCounts,
} from './index';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('rules', () => {
  it('round-trips a FEN through chessops', () => {
    expect(fenOf(positionFromFen(START))).toBe(START);
  });

  it('rejects invalid FENs and illegal moves', () => {
    expect(() => positionFromFen('not a fen')).toThrow(RulesError);
    expect(() => playUci(positionFromFen(START), 'e2e5')).toThrow(RulesError);
  });

  it('plays moves and produces SAN', () => {
    const { pos, san, uci } = playUci(positionFromFen(START), 'e2e4');
    expect(san).toBe('e4');
    expect(uci).toBe('e2e4');
    expect(turn(pos)).toBe('black');
    expect(legalDests(pos).get('e7')).toEqual(expect.arrayContaining(['e6', 'e5']));
  });

  it('detects checkmate with the winner', () => {
    const { pos } = playMove(positionFromFen('4k3/7R/8/8/8/8/8/R3K3 w - - 0 1'), 'a1', 'a8');
    expect(positionEnd(pos)).toEqual({ kind: 'checkmate', winner: 'white' });
  });

  it('detects stalemate', () => {
    const { pos } = playMove(positionFromFen('7k/8/4Q1K1/8/8/8/8/8 w - - 0 1'), 'e6', 'f7');
    expect(positionEnd(pos)).toEqual({ kind: 'stalemate' });
  });

  it('detects insufficient material and the fifty-move rule', () => {
    expect(positionEnd(positionFromFen('8/8/8/4k3/8/8/8/4K3 w - - 0 1'))).toEqual({ kind: 'insufficient-material' });
    expect(positionEnd(positionFromFen('8/8/8/4k3/8/8/8/R3K3 w - - 100 80'))).toEqual({ kind: 'fifty-moves' });
    expect(positionEnd(positionFromFen('8/8/8/4k3/8/8/8/R3K3 w - - 99 80'))).toBeUndefined();
  });

  it('repetition keys ignore the move counters', () => {
    expect(repetitionKey(positionFromFen('8/8/8/4k3/8/8/8/R3K3 w - - 7 12')))
      .toBe(repetitionKey(positionFromFen('8/8/8/4k3/8/8/8/R3K3 w - - 0 1')));
  });

  it('mirrors colours so Black gets the winning side', () => {
    const mirrored = mirrorColors(positionFromFen('8/8/8/4k3/8/8/8/R3K2R w - - 0 1'));
    expect(fenOf(mirrored)).toBe('r3k2r/8/8/8/4K3/8/8/8 b - - 0 1');
  });

  it('recognises promotion moves from the board, not by guessing', () => {
    const pos = positionFromFen('8/P3k3/8/8/8/8/8/4K3 w - - 0 1');
    expect(isPromotionMove(pos, 'a7', 'a8')).toBe(true);
    expect(isPromotionMove(pos, 'e1', 'e2')).toBe(false);
    expect(playMove(pos, 'a7', 'a8', 'queen').san).toBe('a8=Q');
  });

  it('produces the SAN of a sequence of moves without mutating the original position', () => {
    const pos = positionFromFen(START);
    expect(sanLine(pos, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
    expect(fenOf(pos)).toBe(START);
  });

  it('rejects an illegal move in a SAN line', () => {
    expect(() => sanLine(positionFromFen(START), ['e2e5'])).toThrow(RulesError);
  });

  it('picks a uniformly random legal move deterministically given the random source', () => {
    const pos = positionFromFen(START);
    const dests = legalDests(pos);
    const moves = [...dests.entries()].flatMap(([from, tos]) => tos.map(to => `${from}${to}`));
    expect(randomLegalMove(pos, () => 0)).toBe(moves[0]);
    expect(randomLegalMove(pos, () => 0.999999)).toBe(moves[moves.length - 1]);
    // every draw is a legal move
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(moves).toContain(randomLegalMove(pos, () => r));
    }
  });

  it('returns undefined when there is no legal move', () => {
    const { pos } = playMove(positionFromFen('4k3/7R/8/8/8/8/8/R3K3 w - - 0 1'), 'a1', 'a8');
    expect(positionEnd(pos)).toEqual({ kind: 'checkmate', winner: 'white' });
    expect(randomLegalMove(pos)).toBeUndefined();
  });

  it('reads the piece on a square directly off the board', () => {
    const pos = positionFromFen(START);
    expect(pieceAt(pos, 'e1')).toEqual({ color: 'white', role: 'king' });
    expect(pieceAt(pos, 'd8')).toEqual({ color: 'black', role: 'queen' });
    expect(pieceAt(pos, 'e4')).toBeUndefined();
  });

  it('finds each side\'s king square', () => {
    const pos = positionFromFen(START);
    expect(kingSquare(pos, 'white')).toBe('e1');
    expect(kingSquare(pos, 'black')).toBe('e8');
  });

  it('counts pieces per side and role', () => {
    const counts = pieceCounts(positionFromFen(START));
    expect(counts.white).toEqual({ pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 });
    expect(counts.black).toEqual({ pawn: 8, knight: 2, bishop: 2, rook: 2, queen: 1, king: 1 });
  });

  it('lists every occupied square', () => {
    const squares = occupiedSquares(positionFromFen(START));
    expect(squares).toHaveLength(32);
    expect(squares).toEqual(expect.arrayContaining(['e1', 'e8', 'a2', 'h7']));
    expect(squares).not.toEqual(expect.arrayContaining(['e4']));
  });
});
