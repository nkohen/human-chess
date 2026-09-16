// Pure puzzle-solving state machine: no React, no network. The only truth about "right" or
// "wrong" is string equality against `solution[k]`, the engine-verified line lichess sent (A1)
// — nothing here judges a move's quality itself. Legality of the moves being *played* still
// comes from @human-chess/rules (playUci throws RulesError on an illegal move; that should
// never happen here since only solution moves and moves matched against them are ever played).
//
// Board callers (see Puzzles.tsx) have no promotion picker and always auto-queen, the same
// convention as hand-and-brain and memory-trainer in this repo. That means a lichess solution
// whose correct move is an underpromotion (rare) can never be matched from the UI; this module
// still compares the full UCI string (including the promotion letter) so such a puzzle simply
// reports 'wrong' for every queen attempt rather than silently accepting the wrong piece.
import { fenOf, playUci, positionFromFen, type Position, type SquareName } from '@human-chess/rules';

export type SolveStatus = 'thinking' | 'correct' | 'wrong' | 'solved' | 'failed-solved';

export interface SolveState {
  pos: Position;
  solution: string[];
  /** Index into `solution` of the move the solver must find next. */
  index: number;
  /** Set for the life of the puzzle once any wrong attempt has been made. */
  everFailed: boolean;
  status: SolveStatus;
  lastMove: [SquareName, SquareName] | undefined;
}

const isTerminal = (status: SolveStatus): boolean => status === 'solved' || status === 'failed-solved';

export function startSolve(startFen: string, solution: string[]): SolveState {
  if (solution.length === 0) throw new Error('a puzzle solution must have at least one move');
  return {
    pos: positionFromFen(startFen),
    solution,
    index: 0,
    everFailed: false,
    status: 'thinking',
    lastMove: undefined,
  };
}

const squares = (uci: string): [SquareName, SquareName] => [uci.slice(0, 2) as SquareName, uci.slice(2, 4) as SquareName];

/**
 * The solver attempts `uci` (already auto-queened by the caller if it was a promotion) against
 * `solution[state.index]`. Wrong: status becomes 'wrong', the position does not change, and the
 * same index is retried. Correct: the move is played, then the reply (solution[index + 1]) is
 * auto-applied if one exists; status becomes 'solved'/'failed-solved' when that was the last
 * solution move, else 'correct'.
 */
export function attemptMove(state: SolveState, uci: string): SolveState {
  if (isTerminal(state.status)) throw new Error('this puzzle is already finished');

  const expected = state.solution[state.index];
  if (expected === undefined) throw new Error('no solution move remains to compare against');

  if (uci !== expected) {
    return { ...state, status: 'wrong', everFailed: true };
  }

  const played = playUci(state.pos, uci);
  let pos = played.pos;
  let index = state.index + 1;
  let lastMove = squares(uci);

  const reply = state.solution[index];
  if (reply !== undefined) {
    const replayed = playUci(pos, reply);
    pos = replayed.pos;
    lastMove = squares(reply);
    index += 1;
  }

  const done = index >= state.solution.length;
  const status: SolveStatus = done ? (state.everFailed ? 'failed-solved' : 'solved') : 'correct';
  return { pos, solution: state.solution, index, everFailed: state.everFailed, status, lastMove };
}

export const currentFen = (state: SolveState): string => fenOf(state.pos);
export const isSolved = (state: SolveState): boolean => isTerminal(state.status);
