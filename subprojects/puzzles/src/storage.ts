// Reload survival (docs/design/2026-09-18-reload-survival.md): the currently-loaded puzzle
// (fetched once from lichess, never re-fetched on reload — a fresh fetch could hand back a
// different puzzle), solve progress, the puzzle-id input field, and the session tally, as one
// snapshot object, since there is exactly one puzzle active at a time and its solve progress
// makes no sense without it.
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString, isStringArray } from '@human-chess/ui';
import type { ParsedPuzzle } from './puzzle';
import { replaySolve, type SolveState, type SolveStatus } from './solve';

export const STATE_KEY = 'human-chess.puzzles.state.v1';

const isColor = isOneOf(['white', 'black'] as const);
const isSolveStatus = isOneOf(['thinking', 'correct', 'wrong', 'solved', 'failed-solved'] as const);

/** Validates a `ParsedPuzzle` (puzzle.ts) before trusting it out of storage. */
export function isParsedPuzzle(v: unknown): v is ParsedPuzzle {
  if (!isRecord(v)) return false;
  return (
    isString(v.id) &&
    isFiniteNumber(v.rating) &&
    isStringArray(v.themes) &&
    isString(v.startFen) &&
    isColor(v.solverColor) &&
    isStringArray(v.solution) &&
    v.solution.length > 0 &&
    isStringArray(v.setupSans) &&
    (v.gameUrl === undefined || isString(v.gameUrl))
  );
}

export interface Tally {
  solvedFirstTry: number;
  solvedAfterMistake: number;
  total: number;
}

export const EMPTY_TALLY: Tally = { solvedFirstTry: 0, solvedAfterMistake: 0, total: 0 };

function isTally(v: unknown): v is Tally {
  return isRecord(v) && isFiniteNumber(v.solvedFirstTry) && isFiniteNumber(v.solvedAfterMistake) && isFiniteNumber(v.total);
}

/** The stored projection of `SolveState`: `pos` (a live chessops position) and `lastMove` (fully
 * derived from `index`/`solution`) are dropped; `index`/`everFailed`/`status` are kept, since a
 * solve only ever advances by playing real solution moves (solve.ts's `attemptMove`) and so is
 * fully replayable from them via `replaySolve`. */
interface StoredSolveProgress {
  index: number;
  everFailed: boolean;
  status: SolveStatus;
}

function isStoredSolveProgress(v: unknown): v is StoredSolveProgress {
  return (
    isRecord(v) &&
    isFiniteNumber(v.index) &&
    Number.isInteger(v.index) &&
    v.index >= 0 &&
    isBoolean(v.everFailed) &&
    isSolveStatus(v.status)
  );
}

/**
 * Cross-checks `status` against `index`/`everFailed` per solve.ts's own state machine
 * (`attemptMove`/`replaySolve`), so a corrupt or hand-edited combination that `isStoredSolveProgress`
 * alone would let through (right shapes, impossible combination — e.g. status 'solved' with
 * `index` short of the end) is rejected rather than replayed into a state `attemptMove` itself
 * could never produce.
 */
function isConsistentSolveProgress(progress: StoredSolveProgress, solutionLength: number): boolean {
  const { index, everFailed, status } = progress;
  const isTerminal = status === 'solved' || status === 'failed-solved';
  if (isTerminal !== (index === solutionLength)) return false;
  if (status === 'solved' && everFailed) return false;
  if ((status === 'failed-solved' || status === 'wrong') && !everFailed) return false;
  if (status === 'thinking' && index !== 0) return false;
  if (status === 'correct' && !(index > 0 && index < solutionLength)) return false;
  return true;
}

export interface PuzzlesSnapshot {
  puzzle: ParsedPuzzle | undefined;
  solve: SolveState | undefined;
  idInput: string;
  tally: Tally;
}

interface StoredPuzzlesSnapshot {
  puzzle: ParsedPuzzle | undefined;
  solve: StoredSolveProgress | undefined;
  idInput: string;
  tally: Tally;
}

export const INITIAL_SNAPSHOT: PuzzlesSnapshot = { puzzle: undefined, solve: undefined, idInput: '', tally: EMPTY_TALLY };

/** Rebuilds `solve` by replaying its stored `index` against `puzzle.solution`; a replay that
 * throws (an out-of-range index or an illegal move in a corrupt/stale entry) rejects the whole
 * snapshot, never half-restoring. */
export function parsePuzzlesSnapshot(raw: unknown): PuzzlesSnapshot | undefined {
  if (!isRecord(raw) || !isString(raw.idInput) || !isTally(raw.tally)) return undefined;
  const { idInput, tally } = raw;

  if (raw.puzzle === undefined) {
    if (raw.solve !== undefined) return undefined; // solve progress makes no sense without a puzzle
    return { puzzle: undefined, solve: undefined, idInput, tally };
  }
  if (!isParsedPuzzle(raw.puzzle)) return undefined;
  const puzzle = raw.puzzle;

  // A loaded puzzle always has solve progress (startSolve runs as soon as a puzzle is fetched or
  // restored, Puzzles.tsx) — `solve: undefined` alongside a defined `puzzle` is not a reachable
  // live state, only a corrupt or hand-edited one, so it is rejected rather than silently
  // accepted.
  if (raw.solve === undefined) return undefined;
  if (!isStoredSolveProgress(raw.solve)) return undefined;
  if (raw.solve.index > puzzle.solution.length) return undefined;
  if (!isConsistentSolveProgress(raw.solve, puzzle.solution.length)) return undefined;

  let solve: SolveState;
  try {
    solve = replaySolve(puzzle.startFen, puzzle.solution, raw.solve.index, raw.solve.everFailed, raw.solve.status);
  } catch {
    return undefined;
  }
  return { puzzle, solve, idInput, tally };
}

export function serializePuzzlesSnapshot(snapshot: PuzzlesSnapshot): StoredPuzzlesSnapshot {
  return {
    puzzle: snapshot.puzzle,
    solve: snapshot.solve
      ? { index: snapshot.solve.index, everFailed: snapshot.solve.everFailed, status: snapshot.solve.status }
      : undefined,
    idInput: snapshot.idInput,
    tally: snapshot.tally,
  };
}
