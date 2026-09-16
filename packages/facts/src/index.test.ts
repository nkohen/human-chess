import { fenOf, RulesError, START_FEN } from '@human-chess/rules';
import { describe, expect, it } from 'vitest';
import { endPosition, materialPoints, PIECE_ON_OPTIONS, questionsFor, STANDARD_POINTS, touchedSquares } from './index';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KR_VS_K = '4k3/8/8/8/8/8/4R3/4K3 b - - 0 1';

describe('endPosition', () => {
  it('plays a line of UCI moves onto the end position', () => {
    const end = endPosition(START, ['e2e4', 'e7e5', 'g1f3']);
    expect(fenOf(end)).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
  });

  it('throws RulesError on an illegal move in the line', () => {
    expect(() => endPosition(START, ['e2e4', 'e2e4'])).toThrow(RulesError);
  });
});

describe('materialPoints', () => {
  it('is balanced at the start position', () => {
    expect(materialPoints(endPosition(START, []))).toEqual({ white: 39, black: 39, balance: 0 });
  });

  it('counts a lone extra rook as a +5 balance', () => {
    const pos = endPosition(KR_VS_K, []);
    expect(materialPoints(pos)).toEqual({ white: 5, black: 0, balance: 5 });
  });

  it('gives the king no point value (a convention, not an evaluation)', () => {
    expect(STANDARD_POINTS.king).toBe(0);
  });
});

describe('touchedSquares', () => {
  it('after 1. e4 the set is {e2, e4}', () => {
    expect(new Set(touchedSquares(START, ['e2e4']))).toEqual(new Set(['e2', 'e4']));
  });

  it('includes the rook squares on kingside castling', () => {
    // White to castle kingside; king e1-g1, rook h1-f1.
    const beforeCastle = 'rnbqk1nr/pppp1ppp/8/2b1p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const touched = new Set(touchedSquares(beforeCastle, ['e1g1']));
    expect(touched).toContain('e1');
    expect(touched).toContain('g1');
    expect(touched).toContain('h1');
    expect(touched).toContain('f1');
  });

  it('includes the captured pawn square on an en passant capture', () => {
    // Black just played d7d5; white to capture en passant with e5xd6.
    const beforeEp = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    const touched = new Set(touchedSquares(beforeEp, ['e5d6']));
    expect(touched).toContain('e5');
    expect(touched).toContain('d6');
    expect(touched).toContain('d5'); // the captured pawn's square, not the move's own from/to
  });

  it('is empty for an empty line from a position to itself', () => {
    expect(touchedSquares(START, [])).toEqual([]);
  });
});

describe('questionsFor', () => {
  it('returns exactly three questions: check, piece-on, material', () => {
    const questions = questionsFor(START, ['e2e4', 'e7e5'], () => 0);
    expect(questions.map(q => q.kind)).toEqual(['check', 'piece-on', 'material']);
  });

  it('the check question reflects whether the side to move is in check', () => {
    const [check] = questionsFor(KR_VS_K, [], () => 0);
    expect(check).toEqual({ kind: 'check', prompt: 'Is black in check?', answer: true });
  });

  it('the check question is false when nobody is in check', () => {
    const [check] = questionsFor(START, [], () => 0);
    expect(check).toEqual({ kind: 'check', prompt: 'Is white in check?', answer: false });
  });

  it('the piece-on question always names a square the line touched', () => {
    const touched = new Set(touchedSquares(START, ['e2e4']));
    for (const seed of [0, 0.3, 0.99]) {
      const [, pieceOn] = questionsFor(START, ['e2e4'], () => seed);
      if (pieceOn?.kind !== 'piece-on') throw new Error('expected a piece-on question');
      expect(touched).toContain(pieceOn.square);
    }
  });

  it('the piece-on question reports the true contents of the chosen square, deterministically for a fixed random source', () => {
    const [, pieceOn] = questionsFor(START, ['e2e4'], () => 0);
    expect(pieceOn).toEqual({ kind: 'piece-on', square: 'e2', prompt: 'What is on e2?', answer: 'empty' });
  });

  it('the material question reports the true post-line balance and the pre-line balance', () => {
    const [, , material] = questionsFor(KR_VS_K, [], () => 0);
    expect(material).toEqual({
      kind: 'material',
      prompt:
        'After the line, what is the material balance (white minus black, in points)? (standard count: pawn 1, knight 3, bishop 3, rook 5, queen 9)',
      answer: 5,
      before: { white: 5, black: 0, balance: 5 },
    });
  });

  it("the material question's before balance differs from the answer once the line changes material", () => {
    // 1. e4 d5 2. exd5 captures Black's d-pawn, so the balance moves from equal to +1 for White.
    const [, , material] = questionsFor(START_FEN, ['e2e4', 'd7d5', 'e4d5'], () => 0);
    if (material?.kind !== 'material') throw new Error('expected a material question');
    expect(material.before.balance).toBe(0);
    expect(material.answer).toBe(1);
  });

  it('the piece-on option list covers every color/role pair plus empty', () => {
    expect(PIECE_ON_OPTIONS).toHaveLength(1 + 2 * 6);
    expect(PIECE_ON_OPTIONS[0]).toBe('empty');
    expect(PIECE_ON_OPTIONS).toContain('white knight');
    expect(PIECE_ON_OPTIONS).toContain('black king');
  });
});
