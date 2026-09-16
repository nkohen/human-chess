import { positionFromFen, turn } from '@human-chess/rules';
import { describe, expect, it } from 'vitest';
import { INITIAL_FEN, randomStartFen } from './exercise';

describe('randomStartFen', () => {
  it('produces a legal position reachable from the start in SETUP_PLIES plies, white to move', () => {
    // 8 (even) random plies from the start always lands back on White to move.
    const fen = randomStartFen(() => 0);
    const pos = positionFromFen(fen);
    expect(turn(pos)).toBe('white');
  });

  it('is deterministic for a fixed random source and differs from the initial position', () => {
    const fen = randomStartFen(() => 0);
    expect(fen).not.toBe(INITIAL_FEN);
    expect(randomStartFen(() => 0)).toBe(fen);
  });
});
