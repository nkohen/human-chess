import { describe, expect, it } from 'vitest';
import { compareReconstruction, fenSequence } from './compare';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('compareReconstruction', () => {
  it('is one match segment for identical sequences', () => {
    const ucis = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
    expect(compareReconstruction(START_FEN, ucis, ucis)).toEqual([{ kind: 'match', fromPly: 1, toPly: 4 }]);
  });

  it('diverges at ply 5 and never rejoins', () => {
    const real = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'];
    const user = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6'];
    expect(compareReconstruction(START_FEN, real, user)).toEqual([
      { kind: 'match', fromPly: 1, toPly: 4 },
      { kind: 'diverged', fromPly: 5, toPly: 6 },
    ]);
  });

  it('diverges by move order and then rejoins through transposition', () => {
    // Real: 1.Nf3 d5 2.d4. User: 1.d4 d5 2.Nf3. Same position after move 2, different order.
    const real = ['g1f3', 'd7d5', 'd2d4'];
    const user = ['d2d4', 'd7d5', 'g1f3'];
    expect(compareReconstruction(START_FEN, real, user)).toEqual([
      { kind: 'diverged', fromPly: 1, toPly: 2 },
      { kind: 'match', fromPly: 3, toPly: 3 },
    ]);
  });

  it('stops at the shorter (user) sequence without complaint', () => {
    const real = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'];
    const user = ['e2e4', 'e7e5', 'g1f3'];
    expect(compareReconstruction(START_FEN, real, user)).toEqual([{ kind: 'match', fromPly: 1, toPly: 3 }]);
  });

  it('produces no segments for an empty reconstruction', () => {
    expect(compareReconstruction(START_FEN, ['e2e4'], [])).toEqual([]);
  });
});

describe('fenSequence', () => {
  it('includes the start FEN at index 0 and one FEN per move after', () => {
    const fens = fenSequence(START_FEN, ['e2e4', 'e7e5']);
    expect(fens).toHaveLength(3);
    expect(fens[0]).toBe(START_FEN);
    expect(fens[2]).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  });
});
