import { describe, expect, it } from 'vitest';
import { fenOf, parsePgnGame, playUci, positionFromFen } from '@human-chess/rules';
import { attemptMove, currentFen, isSolved, startSolve } from './solve';

// The tBsnX puzzle also used as puzzle.test.ts's fixture (curled 2026-09-16). START_FEN is
// derived the same way puzzle.ts does — playing every parsed move of game.pgn — so this test
// doesn't rely on any hand-transcribed UCI list.
const GAME_PGN =
  'e4 e5 Nf3 Nc6 Bc4 Be7 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 Bb3 a5 Qf3 O-O a4 d5 e5 Ne4 Nc3 Bb4 O-O Ba6 Rd1 Nc5 Be3 Nxb3 cxb3 Qe7 Bf4 Rfd8 Rac1 Qe6 Qg3 Bxc3 Rxc3 d4 Rc5 Be2 Rdc1 Ra6 Bd2 d3 Rxa5';
const START_FEN = fenOf(
  (() => {
    const setup = parsePgnGame(GAME_PGN);
    let pos = positionFromFen(setup.startFen);
    for (const uci of setup.ucis) pos = playUci(pos, uci).pos;
    return pos;
  })(),
);
const SOLUTION = ['a6a5', 'd2a5', 'd3d2', 'a5d2', 'd8d2'];

describe('startSolve', () => {
  it('starts in thinking status at the given fen', () => {
    const state = startSolve(START_FEN, SOLUTION);
    expect(state.status).toBe('thinking');
    expect(currentFen(state)).toBe(START_FEN);
    expect(isSolved(state)).toBe(false);
  });

  it('throws for an empty solution', () => {
    expect(() => startSolve(START_FEN, [])).toThrow();
  });
});

describe('attemptMove', () => {
  it('marks a wrong move as wrong without changing the position, and lets the solver retry', () => {
    const state = startSolve(START_FEN, SOLUTION);
    const afterWrong = attemptMove(state, 'a6b6');
    expect(afterWrong.status).toBe('wrong');
    expect(currentFen(afterWrong)).toBe(START_FEN);
    expect(afterWrong.index).toBe(0);

    const afterRetry = attemptMove(afterWrong, SOLUTION[0]!);
    expect(afterRetry.status).toBe('correct');
  });

  it('applies a correct move plus the auto-played reply, advancing the index by 2', () => {
    const state = startSolve(START_FEN, SOLUTION);
    const next = attemptMove(state, SOLUTION[0]!);
    expect(next.status).toBe('correct');
    expect(next.index).toBe(2);
    expect(next.lastMove).toEqual(['d2', 'a5']);
  });

  it('solves the whole puzzle first try, ending in solved (not failed-solved)', () => {
    let state = startSolve(START_FEN, SOLUTION);
    state = attemptMove(state, SOLUTION[0]!); // index 0 -> 2 (reply auto-applied)
    expect(state.index).toBe(2);
    state = attemptMove(state, SOLUTION[2]!); // index 2 -> 4 (reply auto-applied)
    expect(state.index).toBe(4);
    // Puzzle has 5 solution moves (odd count): the solver plays index 0, 2, then 4 is last with
    // no reply since index 4 is the final entry.
    state = attemptMove(state, SOLUTION[4]!);
    expect(state.status).toBe('solved');
    expect(isSolved(state)).toBe(true);
    expect(state.index).toBe(5);
  });

  it('ends in failed-solved when a wrong attempt happened anywhere before solving', () => {
    let state = startSolve(START_FEN, SOLUTION);
    state = attemptMove(state, 'a6b6'); // wrong
    state = attemptMove(state, SOLUTION[0]!); // retry, correct
    state = attemptMove(state, SOLUTION[2]!); // correct
    state = attemptMove(state, SOLUTION[4]!); // correct, solves it
    expect(state.status).toBe('failed-solved');
    expect(isSolved(state)).toBe(true);
  });

  it('throws when attempting a move after the puzzle is already finished', () => {
    let state = startSolve(START_FEN, SOLUTION);
    state = attemptMove(state, SOLUTION[0]!);
    state = attemptMove(state, SOLUTION[2]!);
    state = attemptMove(state, SOLUTION[4]!);
    expect(state.status).toBe('solved');
    expect(() => attemptMove(state, SOLUTION[0]!)).toThrow();
  });
});
