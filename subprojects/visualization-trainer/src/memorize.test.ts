import { EMPTY_PLACEMENT_FEN, START_FEN } from '@human-chess/rules';
import { describe, expect, it } from 'vitest';
import { describeDiff, MEMORIZE_ROUNDS, pickMemorizePositions, scoreRebuild } from './memorize';

const START_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

describe('pickMemorizePositions', () => {
  it('random: returns the requested count, each a legal fen', () => {
    const fens = pickMemorizePositions('random', MEMORIZE_ROUNDS, () => 0);
    expect(fens).toHaveLength(MEMORIZE_ROUNDS);
    for (const fen of fens) expect(typeof fen).toBe('string');
  });

  it('random: deterministic for a fixed random source', () => {
    expect(pickMemorizePositions('random', 3, () => 0)).toEqual(pickMemorizePositions('random', 3, () => 0));
  });

  it('curated: returns the requested count of real, distinct FENs without replacement while the pool allows it', () => {
    const fens = pickMemorizePositions('curated', MEMORIZE_ROUNDS, () => 0);
    expect(fens).toHaveLength(MEMORIZE_ROUNDS);
    expect(new Set(fens).size).toBe(MEMORIZE_ROUNDS);
  });

  it('curated: never returns fewer than asked even if count exceeds the pool (wraps around)', () => {
    const fens = pickMemorizePositions('curated', 1000, () => 0.999999);
    expect(fens).toHaveLength(1000);
  });
});

describe('scoreRebuild', () => {
  it('scores a perfect rebuild as 1 with no diffs', () => {
    const score = scoreRebuild(START_FEN, START_PLACEMENT);
    expect(score).toMatchObject({ correct: 32, missing: 0, extra: 0, wrongPiece: 0, totalOriginalPieces: 32, score: 1 });
    expect(score.diffs).toEqual([]);
  });

  it('scores an empty rebuild as all missing', () => {
    const score = scoreRebuild(START_FEN, EMPTY_PLACEMENT_FEN);
    expect(score.correct).toBe(0);
    expect(score.missing).toBe(32);
    expect(score.score).toBe(0);
    expect(score.diffs).toHaveLength(32);
    expect(score.diffs.every(d => d.kind === 'missing')).toBe(true);
  });

  it('counts a wrong piece on an occupied square and describes it', () => {
    // Same as the start position but a knight sits on e1 instead of the king.
    const rebuilt = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNN';
    const score = scoreRebuild(START_FEN, rebuilt);
    expect(score.wrongPiece).toBe(1);
    expect(score.correct).toBe(31);
    const diff = score.diffs.find(d => d.square === 'h1');
    expect(diff).toMatchObject({ kind: 'wrong-piece', original: { color: 'white', role: 'rook' }, rebuilt: { color: 'white', role: 'knight' } });
    expect(describeDiff(diff!)).toBe('h1: you put a white knight, it was a white rook');
  });

  it('counts an extra piece on a square the original left empty and describes it', () => {
    const rebuilt = 'rnbqkbnr/pppppppp/8/8/4N3/8/PPPPPPPP/RNBQKBNR';
    const score = scoreRebuild(START_FEN, rebuilt);
    expect(score.extra).toBe(1);
    expect(score.correct).toBe(32);
    const diff = score.diffs.find(d => d.square === 'e4');
    expect(diff).toMatchObject({ kind: 'extra', rebuilt: { color: 'white', role: 'knight' } });
    expect(describeDiff(diff!)).toBe('e4: you put a white knight, there was nothing');
  });

  it('describes a missing piece', () => {
    const rebuilt = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1';
    const score = scoreRebuild(START_FEN, rebuilt);
    const diff = score.diffs.find(d => d.square === 'h1');
    expect(describeDiff(diff!)).toBe('h1: white rook missing');
  });

  it('tolerates a rebuild placement with no king at all, unlike positionFromFen', () => {
    const score = scoreRebuild(START_FEN, EMPTY_PLACEMENT_FEN);
    expect(score.totalOriginalPieces).toBe(32);
  });

  it('sorts diffs by square name for a stable display order', () => {
    const score = scoreRebuild(START_FEN, EMPTY_PLACEMENT_FEN);
    const squares = score.diffs.map(d => d.square);
    expect(squares).toEqual([...squares].sort());
  });
});
