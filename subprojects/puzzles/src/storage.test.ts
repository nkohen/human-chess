import { describe, expect, it } from 'vitest';
import type { ParsedPuzzle } from './puzzle';
import { startSolve } from './solve';
import { EMPTY_TALLY, INITIAL_SNAPSHOT, parsePuzzlesSnapshot, serializePuzzlesSnapshot, type PuzzlesSnapshot } from './storage';

const PUZZLE: ParsedPuzzle = {
  id: 'abc12',
  rating: 1500,
  themes: ['fork', 'middlegame'],
  startFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  solverColor: 'black',
  solution: ['b8c6', 'f1c4', 'g8f6'],
  setupSans: ['e4', 'e5', 'Nf3'],
  gameUrl: 'https://lichess.org/abcdefgh',
};

describe('parsePuzzlesSnapshot', () => {
  it('round-trips the empty (no puzzle loaded yet) snapshot', () => {
    expect(parsePuzzlesSnapshot(serializePuzzlesSnapshot(INITIAL_SNAPSHOT))).toEqual(INITIAL_SNAPSHOT);
  });

  it('round-trips a puzzle with no attempt made yet (index 0)', () => {
    const snapshot: PuzzlesSnapshot = { puzzle: PUZZLE, solve: startSolve(PUZZLE.startFen, PUZZLE.solution), idInput: '', tally: EMPTY_TALLY };
    const parsed = parsePuzzlesSnapshot(serializePuzzlesSnapshot(snapshot));
    expect(parsed).toEqual(snapshot);
  });

  it('round-trips a puzzle mid-solve (index advanced by a correct attempt + auto-reply)', () => {
    // startSolve + one correct move: index advances by 2 (the solver's move, then the auto-replied
    // opponent reply), exactly like solve.ts's attemptMove.
    const stored = {
      puzzle: PUZZLE,
      solve: { index: 2, everFailed: false, status: 'correct' },
      idInput: '999',
      tally: { solvedFirstTry: 1, solvedAfterMistake: 0, total: 1 },
    };
    const parsed = parsePuzzlesSnapshot(stored);
    expect(parsed?.solve?.index).toBe(2);
    expect(parsed?.solve?.status).toBe('correct');
    expect(parsed?.solve?.lastMove).toEqual(['f1', 'c4']); // uciSquares of solution[1], the auto-replied move
    expect(parsed?.idInput).toBe('999');
    expect(parsed?.tally.total).toBe(1);
  });

  it('round-trips a solved puzzle (index === solution.length)', () => {
    const stored = {
      puzzle: PUZZLE,
      solve: { index: 3, everFailed: true, status: 'failed-solved' },
      idInput: '',
      tally: EMPTY_TALLY,
    };
    const parsed = parsePuzzlesSnapshot(stored);
    expect(parsed?.solve?.status).toBe('failed-solved');
    expect(parsed?.solve?.everFailed).toBe(true);
  });

  it('rejects solve progress with no puzzle', () => {
    const stored = { puzzle: undefined, solve: { index: 0, everFailed: false, status: 'thinking' }, idInput: '', tally: EMPTY_TALLY };
    expect(parsePuzzlesSnapshot(stored)).toBeUndefined();
  });

  it('rejects an index beyond the puzzle solution length', () => {
    const stored = { puzzle: PUZZLE, solve: { index: 99, everFailed: false, status: 'thinking' }, idInput: '', tally: EMPTY_TALLY };
    expect(parsePuzzlesSnapshot(stored)).toBeUndefined();
  });

  it('rejects a corrupt puzzle shape (bad move list)', () => {
    const badPuzzle = { ...PUZZLE, solution: [1, 2, 3] };
    const stored = { puzzle: badPuzzle, solve: undefined, idInput: '', tally: EMPTY_TALLY };
    expect(parsePuzzlesSnapshot(stored)).toBeUndefined();
  });

  it('rejects an unknown solve status', () => {
    const stored = { puzzle: PUZZLE, solve: { index: 0, everFailed: false, status: 'giving-up' }, idInput: '', tally: EMPTY_TALLY };
    expect(parsePuzzlesSnapshot(stored)).toBeUndefined();
  });

  it('rejects a corrupt overall shape', () => {
    expect(parsePuzzlesSnapshot(undefined)).toBeUndefined();
    expect(parsePuzzlesSnapshot({ puzzle: undefined, solve: undefined, idInput: 3, tally: EMPTY_TALLY })).toBeUndefined();
    expect(parsePuzzlesSnapshot({ puzzle: undefined, solve: undefined, idInput: '', tally: { total: 1 } })).toBeUndefined();
  });
});
