import { describe, expect, it } from 'vitest';
import {
  currentFen, lastReconstructedMove, playReconstructionMove, reconstructedSans, reconstructedUcis,
  reconstructionDests, sideToMove, startReconstruction,
} from './reconstruction';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('reconstruction', () => {
  it('starts empty at the given FEN', () => {
    const r = startReconstruction(START_FEN);
    expect(currentFen(r)).toBe(START_FEN);
    expect(sideToMove(r)).toBe('white');
    expect(reconstructedUcis(r)).toEqual([]);
    expect(reconstructionDests(r).size).toBeGreaterThan(0);
  });

  it('lets the same learner play both sides', () => {
    let r = startReconstruction(START_FEN);
    r = playReconstructionMove(r, 'e2', 'e4');
    expect(sideToMove(r)).toBe('black');
    r = playReconstructionMove(r, 'e7', 'e5');
    expect(sideToMove(r)).toBe('white');
    expect(reconstructedUcis(r)).toEqual(['e2e4', 'e7e5']);
    expect(reconstructedSans(r)).toEqual(['e4', 'e5']);
    expect(lastReconstructedMove(r)).toEqual(['e7', 'e5']);
  });

  it('auto-queens promotions', () => {
    let r = startReconstruction('8/P7/8/4k3/8/8/8/4K3 w - - 0 1');
    r = playReconstructionMove(r, 'a7', 'a8');
    expect(reconstructedUcis(r)).toEqual(['a7a8q']);
    expect(reconstructedSans(r)).toEqual(['a8=Q']);
  });
});
