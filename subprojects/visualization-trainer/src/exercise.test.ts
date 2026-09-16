import { positionFromFen, turn } from '@human-chess/rules';
import { describe, expect, it } from 'vitest';
import { formatLine, INITIAL_FEN, lineSans, randomStartFen } from './exercise';

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

describe('lineSans', () => {
  it('produces SAN for a UCI line off the given start position', () => {
    expect(lineSans(INITIAL_FEN, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
  });
});

describe('formatLine', () => {
  it('numbers a line starting with white', () => {
    // fullmove 5, white to move (as SETUP_PLIES = 8 always produces).
    const startFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 4 4';
    expect(formatLine(startFen, ['Bb5', 'a6', 'Ba4'])).toBe('4. Bb5 a6 5. Ba4');
  });

  it('numbers a line starting with black, using the ellipsis for the first move', () => {
    const startFen = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 3 3';
    expect(formatLine(startFen, ['Nc6', 'Bb5', 'a6'])).toBe('3… Nc6 4. Bb5 a6');
  });
});
