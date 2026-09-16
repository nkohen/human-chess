import { describe, expect, it } from 'vitest';
import {
  fenOf, isPromotionMove, legalDests, mirrorColors, playMove, playUci, positionEnd,
  positionFromFen, repetitionKey, RulesError, turn,
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
});
