// Logic for the "Memorize" mode (memory/subprojects/visualization-trainer.md, "Extra modes":
// a timed position-memorizer minigame). Position selection is injectable-random so tests are
// deterministic (same pattern as exercise.ts's randomStartPosition). Scoring never judges
// legality itself: the original position is read via @human-chess/rules' positionFromFen/
// occupiedSquares/pieceAt (it is always a real legal position, curated or random-play); the
// rebuilt board is a board-editor placement that is not guaranteed to be legal while the
// learner is still working on it, so it is read via piecesOfPlacement instead (A1 — still a
// rules-library read, never hand-parsed FEN, just one that tolerates an illegal placement).
import { curatedEndgames, curatedMidgames } from '@human-chess/positions';
import {
  occupiedSquares,
  pieceAt,
  piecesOfPlacement,
  positionFromFen,
  type Color,
  type Role,
  type SquareName,
} from '@human-chess/rules';
import { randomStartFen } from './exercise';

/** Study durations offered in settings. 10s is a first guess, not tuned against real usage. */
export const STUDY_SECONDS_OPTIONS = [5, 10, 20] as const;
export type StudySeconds = (typeof STUDY_SECONDS_OPTIONS)[number];
export const DEFAULT_STUDY_SECONDS: StudySeconds = 10;

export type MemorizeSource = 'random' | 'curated';
export const DEFAULT_MEMORIZE_SOURCE: MemorizeSource = 'random';

/** Positions per session; matches the Lines mode's ROUNDS (exercise.ts) so both modes are the
 * same length. */
export const MEMORIZE_ROUNDS = 5;

/** The curated pool this mode draws from when source is 'curated': the user's own real-game
 * endgames and middlegames (packages/positions), pooled together. Every FEN there is already
 * validated (curated.test.ts) — nothing here re-checks legality. */
const CURATED_POOL: readonly string[] = [...curatedEndgames, ...curatedMidgames].map(p => p.fen);

/**
 * `count` start FENs for one session, drawn from `source`. 'random' is the same random-play
 * generator the Lines mode uses (randomStartFen); 'curated' draws without replacement from the
 * user's curated pool, falling back to sampling with replacement if the pool is smaller than
 * `count` (it is not today, but a caller should never get fewer positions than asked for).
 */
export function pickMemorizePositions(source: MemorizeSource, count: number, random: () => number = Math.random): string[] {
  if (source === 'random') return Array.from({ length: count }, () => randomStartFen(random));
  if (CURATED_POOL.length === 0) throw new Error('curated pool is empty');
  const pool = [...CURATED_POOL];
  const picked: string[] = [];
  while (picked.length < count) {
    if (pool.length === 0) pool.push(...CURATED_POOL); // wrap around rather than return short
    const idx = Math.min(Math.floor(random() * pool.length), pool.length - 1);
    picked.push(pool.splice(idx, 1)[0]!);
  }
  return picked;
}

export type SquareDiffKind = 'missing' | 'extra' | 'wrong-piece';

export interface SquareDiff {
  square: SquareName;
  kind: SquareDiffKind;
  /** The piece that was really there; absent only for an 'extra' square. */
  original?: { color: Color; role: Role };
  /** The piece the learner placed; absent only for a 'missing' square. */
  rebuilt?: { color: Color; role: Role };
}

export interface MemorizeScore {
  correct: number;
  missing: number;
  extra: number;
  wrongPiece: number;
  /** Pieces on the original board — the denominator `score` is out of. */
  totalOriginalPieces: number;
  /** correct / totalOriginalPieces; 0 for the (never-happens-in-practice) empty original. */
  score: number;
  /** Every non-correct square, sorted by square name for a stable display order. */
  diffs: SquareDiff[];
}

const samePiece = (a: { color: Color; role: Role } | undefined, b: { color: Color; role: Role } | undefined): boolean =>
  a !== undefined && b !== undefined && a.color === b.color && a.role === b.role;

/**
 * Scores a rebuild against the original position, square by square, per the spec: correct /
 * missing / extra / wrong-piece counts, and a score of correct / (pieces in the original).
 * `originalFen` is a full FEN (always a legal position here); `rebuiltPlacement` is whatever
 * `BoardEditor.onChange` last reported (piece-placement only, and possibly not a legal position).
 */
export function scoreRebuild(originalFen: string, rebuiltPlacement: string): MemorizeScore {
  const originalPos = positionFromFen(originalFen);
  const originalSquares = occupiedSquares(originalPos);
  const originalSquareSet = new Set<SquareName>(originalSquares);
  const rebuiltPieces = piecesOfPlacement(rebuiltPlacement);

  let correct = 0;
  let missing = 0;
  let wrongPiece = 0;
  let extra = 0;
  const diffs: SquareDiff[] = [];

  for (const square of originalSquares) {
    // occupiedSquares only ever returns squares pieceAt finds a piece on, but the two are
    // separate rules calls as far as the type checker knows, hence the assertion.
    const original = pieceAt(originalPos, square)!;
    const rebuilt = rebuiltPieces.get(square);
    if (samePiece(original, rebuilt)) {
      correct++;
    } else if (rebuilt === undefined) {
      missing++;
      diffs.push({ square, kind: 'missing', original });
    } else {
      wrongPiece++;
      diffs.push({ square, kind: 'wrong-piece', original, rebuilt });
    }
  }
  for (const [square, piece] of rebuiltPieces) {
    if (!originalSquareSet.has(square)) {
      extra++;
      diffs.push({ square, kind: 'extra', rebuilt: piece });
    }
  }
  diffs.sort((a, b) => a.square.localeCompare(b.square));

  const totalOriginalPieces = originalSquares.length;
  return {
    correct,
    missing,
    extra,
    wrongPiece,
    totalOriginalPieces,
    score: totalOriginalPieces > 0 ? correct / totalOriginalPieces : 0,
    diffs,
  };
}

/** One human-readable line per diff, e.g. "h1: white rook missing" or "e5: you put a black
 * knight, it was a white knight" — colour and role both, so a right-square-wrong-colour piece
 * (which samePiece above already scores as wrong, not correct) reads as wrong in the text too. */
export function describeDiff(diff: SquareDiff): string {
  switch (diff.kind) {
    case 'missing':
      return `${diff.square}: ${diff.original!.color} ${diff.original!.role} missing`;
    case 'extra':
      return `${diff.square}: you put a ${diff.rebuilt!.color} ${diff.rebuilt!.role}, there was nothing`;
    case 'wrong-piece':
      return `${diff.square}: you put a ${diff.rebuilt!.color} ${diff.rebuilt!.role}, it was a ${diff.original!.color} ${diff.original!.role}`;
  }
}
