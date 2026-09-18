// Pure puzzle-solving state machine: no React, no network. The only truth about "right" or
// "wrong" is string equality against `solution[k]`, the engine-verified line lichess sent (A1)
// — nothing here judges a move's quality itself. Legality of the moves being *played* still
// comes from @human-chess/rules (playUci throws RulesError on an illegal move; that should
// never happen here since only solution moves and moves matched against them are ever played).
//
// Comparing the full UCI string (including the promotion letter, when there is one) means an
// underpromotion solution matches like any other move: Puzzles.tsx builds the attempted UCI from
// whatever piece the board's picker returned, so a puzzle whose only solution is an
// underpromotion (rare, but real) is reachable from the UI rather than permanently unplayable.
import { fenOf, playUci, positionFromFen, uciSquares, type Position, type SquareName } from '@human-chess/rules';

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

/**
 * The solver attempts `uci` (with the promotion letter the board's picker returned, if any) against
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
  let lastMove = uciSquares(uci);

  const reply = state.solution[index];
  if (reply !== undefined) {
    const replayed = playUci(pos, reply);
    pos = replayed.pos;
    lastMove = uciSquares(reply);
    index += 1;
  }

  const done = index >= state.solution.length;
  const status: SolveStatus = done ? (state.everFailed ? 'failed-solved' : 'solved') : 'correct';
  return { pos, solution: state.solution, index, everFailed: state.everFailed, status, lastMove };
}

export const currentFen = (state: SolveState): string => fenOf(state.pos);
export const isSolved = (state: SolveState): boolean => isTerminal(state.status);

/**
 * Rebuilds a `SolveState` by replaying the first `index` moves of `solution` from `startFen` —
 * used to restore a persisted solve across a page reload (docs/design/2026-09-18-reload-survival.md).
 * `index`, `everFailed` and `status` are exactly the fields storage.ts persists; `lastMove` is
 * always derived here from `solution[index - 1]`, never itself stored, since it is fully
 * determined by `index`. Throws (via `playUci`'s RulesError) if `index` is out of range or a
 * solution move is illegal against the replayed position; the caller treats that as "reject the
 * whole snapshot".
 */
export function replaySolve(startFen: string, solution: string[], index: number, everFailed: boolean, status: SolveStatus): SolveState {
  if (index < 0 || index > solution.length) throw new Error('replay index out of range for this puzzle solution');
  let pos = positionFromFen(startFen);
  let lastMove: [SquareName, SquareName] | undefined = undefined;
  for (let i = 0; i < index; i++) {
    const uci = solution[i]!;
    pos = playUci(pos, uci).pos;
    lastMove = uciSquares(uci);
  }
  return { pos, solution, index, everFailed, status, lastMove };
}
