import { fenOf, RulesError } from '@human-chess/rules';
import { describe, expect, it } from 'vitest';
import { endPosition, materialPoints, PIECE_ON_OPTIONS, questionsFor, STANDARD_POINTS } from './index';

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

describe('questionsFor', () => {
  it('returns exactly three questions: check, piece-on, material', () => {
    const questions = questionsFor(endPosition(START, []), () => 0);
    expect(questions.map(q => q.kind)).toEqual(['check', 'piece-on', 'material']);
  });

  it('the check question reflects whether the side to move is in check', () => {
    const [check] = questionsFor(endPosition(KR_VS_K, []), () => 0);
    expect(check).toEqual({ kind: 'check', prompt: 'Is black in check?', answer: true });
  });

  it('the check question is false when nobody is in check', () => {
    const [check] = questionsFor(endPosition(START, []), () => 0);
    expect(check).toEqual({ kind: 'check', prompt: 'Is white in check?', answer: false });
  });

  it('the piece-on question names a real square and its true contents, deterministically for a fixed random source', () => {
    const [, pieceOn] = questionsFor(endPosition(START, []), () => 0);
    expect(pieceOn).toEqual({ kind: 'piece-on', square: 'a1', prompt: 'What is on a1?', answer: 'white rook' });
  });

  it('the piece-on question can land on an empty square', () => {
    const [, pieceOn] = questionsFor(endPosition(KR_VS_K, []), () => 0);
    expect(pieceOn).toEqual({ kind: 'piece-on', square: 'e1', prompt: 'What is on e1?', answer: 'white king' });
  });

  it('the material question reports the true balance', () => {
    const [, , material] = questionsFor(endPosition(KR_VS_K, []), () => 0);
    expect(material).toEqual({
      kind: 'material',
      prompt: 'What is the material balance (white minus black, in points)? (standard count: pawn 1, knight 3, bishop 3, rook 5, queen 9)',
      answer: 5,
    });
  });

  it('the piece-on option list covers every color/role pair plus empty', () => {
    expect(PIECE_ON_OPTIONS).toHaveLength(1 + 2 * 6);
    expect(PIECE_ON_OPTIONS[0]).toBe('empty');
    expect(PIECE_ON_OPTIONS).toContain('white knight');
    expect(PIECE_ON_OPTIONS).toContain('black king');
  });
});
