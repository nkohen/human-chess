import { describe, expect, it } from 'vitest';
import { castlingRightsFor, composeFen, EMPTY_PLACEMENT_FEN, positionFromFen, RulesError, START_FEN } from './index';

const START_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

describe('composeFen', () => {
  it('builds the standard starting FEN from its pieces', () => {
    expect(composeFen(START_PLACEMENT, 'white', 'KQkq')).toBe(START_FEN);
  });

  it('round-trips through positionFromFen for a position with no castling rights', () => {
    const placement = '8/8/8/4k3/8/8/8/4K2R';
    const fen = composeFen(placement, 'white', 'K');
    expect(positionFromFen(fen)).toBeDefined();
    expect(fen).toBe('8/8/8/4k3/8/8/8/4K2R w K - 0 1');
  });

  it('includes an en-passant square when given one', () => {
    const placement = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR';
    const fen = composeFen(placement, 'white', 'KQkq', 'd6');
    expect(fen).toBe('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 1');
  });

  it('rejects an unparseable placement', () => {
    expect(() => composeFen('not a placement', 'white', '-')).toThrow(RulesError);
  });

  it('drops castling rights the placement cannot support instead of emitting Chess960 letters', () => {
    expect(composeFen('4k3/8/8/8/8/8/8/4K3', 'white', 'KQkq')).toBe('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(composeFen('r3k3/8/8/8/8/8/8/4K2R', 'black', 'KQkq')).toBe('r3k3/8/8/8/8/8/8/4K2R b Kq - 0 1');
  });
});

describe('castlingRightsFor', () => {
  it('offers all four rights in the starting position', () => {
    expect(castlingRightsFor(START_PLACEMENT)).toBe('KQkq');
  });

  it('offers nothing on an empty board', () => {
    expect(castlingRightsFor(EMPTY_PLACEMENT_FEN)).toBe('');
  });

  it('drops a right when its rook is gone but keeps the other side', () => {
    // White has moved/lost the a1 rook; h1 rook and both kings still home.
    expect(castlingRightsFor('r3k2r/8/8/8/8/8/8/4K2R')).toBe('Kkq');
  });

  it('drops both rights for a side whose king has moved', () => {
    expect(castlingRightsFor('r3k2r/8/8/8/8/4K3/8/R6R')).toBe('kq');
  });
});
