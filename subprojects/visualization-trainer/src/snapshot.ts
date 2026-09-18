// Reload survival (docs/design/2026-09-18-reload-survival.md): one persisted snapshot object per
// screen, each behind its own `human-chess.visualizationTrainer.<name>.v1` key, validated on the
// way back in by the `parse*` functions below so a stale or corrupt entry is rejected as a whole
// rather than half-restored. `mode` (VisualizationTrainer.tsx) was already persisted, unchanged
// here (mode.ts's own raw-string storage). Nothing here re-derives an engine line that was already
// shown to the learner — a stored exercise is exactly the PV the engine returned (A1); random
// picks (LinesTrainer's startPosition, MemorizeTrainer's sessionFens) are stored whole, never
// re-rolled on reload. MemorizeTrainer's `phase` already carries its own absolute `endAt`/
// `startAt`, so it is persisted verbatim — the existing "did the study clock already run out"
// effect (MemorizeTrainer.tsx) re-evaluates that deadline against `Date.now()` on the very first
// render after a restore exactly the way it does on every other tick, so a clock that expired
// while the tab was away moves straight on to rebuilding without any extra code here.
import { endPosition } from '@human-chess/facts';
import { positionFromFen, uciSquares } from '@human-chess/rules';
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString, isStringArray } from '@human-chess/ui';
import { randomStartPosition, ROUNDS } from './exercise';
import { MEMORIZE_ROUNDS, STUDY_SECONDS_OPTIONS, type MemorizeScore, type MemorizeSource, type SquareDiff, type StudySeconds } from './memorize';

/** A FEN that fails to parse (corrupt storage, a hand-edited value) would otherwise throw deep
 * inside a render (positionFromFen/endPosition are called unguarded by every screen); rejecting it
 * here means the screen starts fresh instead of white-screening
 * (docs/design/2026-09-18-reload-survival.md). */
function isLegalFen(fen: string): boolean {
  try {
    positionFromFen(fen);
    return true;
  } catch {
    return false;
  }
}

function isStudySeconds(v: unknown): v is StudySeconds {
  return isFiniteNumber(v) && (STUDY_SECONDS_OPTIONS as readonly number[]).includes(v);
}

const isColor = isOneOf(['white', 'black'] as const);
const isRole = isOneOf(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const);

function isPiece(v: unknown): v is { color: 'white' | 'black'; role: 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king' } {
  return isRecord(v) && isColor(v.color) && isRole(v.role);
}

const isSquareDiffKind = isOneOf(['missing', 'extra', 'wrong-piece'] as const);

function isSquareDiff(v: unknown): v is SquareDiff {
  return (
    isRecord(v) &&
    isString(v.square) &&
    isSquareDiffKind(v.kind) &&
    (v.original === undefined || isPiece(v.original)) &&
    (v.rebuilt === undefined || isPiece(v.rebuilt))
  );
}

function isMemorizeScore(v: unknown): v is MemorizeScore {
  return (
    isRecord(v) &&
    isFiniteNumber(v.correct) &&
    isFiniteNumber(v.missing) &&
    isFiniteNumber(v.extra) &&
    isFiniteNumber(v.wrongPiece) &&
    isFiniteNumber(v.totalOriginalPieces) &&
    isFiniteNumber(v.score) &&
    Array.isArray(v.diffs) &&
    v.diffs.every(isSquareDiff)
  );
}

// ---------- LinesTrainer.tsx ----------

export interface StartPositionSnapshot {
  fen: string;
  moves: string[];
}

export interface ExerciseSnapshot {
  startFen: string;
  ucis: string[];
}

export interface AnswersSnapshot {
  check: boolean | undefined;
  pieceOn: string | undefined;
  material: string;
}

export const EMPTY_ANSWERS: AnswersSnapshot = { check: undefined, pieceOn: undefined, material: '' };

export interface LinesSnapshot {
  startPosition: StartPositionSnapshot;
  /** The engine's PV for `startPosition`, once ready — undefined while loading/failed/no-line,
   * all of which are cheap to recompute and so are never persisted (the design rule's own words). */
  exercise: ExerciseSnapshot | undefined;
  answers: AnswersSnapshot;
  revealed: boolean;
  tally: { correct: number; total: number };
  round: number;
  sessionDone: boolean;
}

function isStartPositionSnapshot(v: unknown): v is StartPositionSnapshot {
  if (!isRecord(v) || !isString(v.fen) || !isStringArray(v.moves)) return false;
  if (!isLegalFen(v.fen)) return false;
  // Only the last move is ever read back out (uciSquares, for the "previous move" highlight), but
  // it is read unguarded, so a corrupt entry there needs the same rejection as a corrupt fen.
  const lastMove = v.moves[v.moves.length - 1];
  if (lastMove === undefined) return true;
  try {
    uciSquares(lastMove);
    return true;
  } catch {
    return false;
  }
}

function isExerciseSnapshot(v: unknown): v is ExerciseSnapshot {
  if (!isRecord(v) || !isString(v.startFen) || !isStringArray(v.ucis) || v.ucis.length === 0) return false;
  // The line must actually replay legally from startFen (A1: never a re-mined/fabricated line);
  // an illegal or corrupt uci list would otherwise throw inside endPosition/questionsFor at render.
  try {
    endPosition(v.startFen, v.ucis);
    return true;
  } catch {
    return false;
  }
}

function isAnswersSnapshot(v: unknown): v is AnswersSnapshot {
  return isRecord(v) && (v.check === undefined || isBoolean(v.check)) && (v.pieceOn === undefined || isString(v.pieceOn)) && isString(v.material);
}

function isTally(v: unknown): v is { correct: number; total: number } {
  return isRecord(v) && isFiniteNumber(v.correct) && isFiniteNumber(v.total);
}

function isRound(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v >= 1 && v <= ROUNDS;
}

export const VT_LINES_KEY = 'human-chess.visualizationTrainer.lines.v1';

export function freshLinesSnapshot(): LinesSnapshot {
  return { startPosition: randomStartPosition(), exercise: undefined, answers: EMPTY_ANSWERS, revealed: false, tally: { correct: 0, total: 0 }, round: 1, sessionDone: false };
}

export function parseLinesSnapshot(raw: unknown): LinesSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  const { startPosition, exercise, answers, revealed, tally, round, sessionDone } = raw;
  if (!isStartPositionSnapshot(startPosition)) return undefined;
  if (exercise !== undefined && !isExerciseSnapshot(exercise)) return undefined;
  if (!isAnswersSnapshot(answers)) return undefined;
  if (!isBoolean(revealed) || !isTally(tally) || !isRound(round) || !isBoolean(sessionDone)) return undefined;
  // A revealed exercise must carry the line that produced the reveal, never a re-mined one (A1).
  if (revealed && !exercise) return undefined;
  // An exercise from a previous startPosition (stale storage, a hand-edited value) would otherwise
  // show as this position's own line.
  if (exercise && exercise.startFen !== startPosition.fen) return undefined;
  return { startPosition, exercise, answers, revealed, tally, round, sessionDone };
}

// ---------- MemorizeTrainer.tsx ----------

interface MemorizeResultSnapshot {
  studySeconds: StudySeconds;
  rebuildMs: number;
  score: MemorizeScore;
}

function isMemorizeResult(v: unknown): v is MemorizeResultSnapshot {
  return isRecord(v) && isStudySeconds(v.studySeconds) && isFiniteNumber(v.rebuildMs) && isMemorizeScore(v.score);
}

export type MemorizePhaseSnapshot =
  | { kind: 'settings' }
  | { kind: 'studying'; index: number; fen: string; studySeconds: StudySeconds; endAt: number }
  | { kind: 'rebuilding'; index: number; fen: string; studySeconds: StudySeconds; startAt: number; placement: string }
  | { kind: 'reviewed'; index: number; fen: string; studySeconds: StudySeconds; rebuildMs: number; placement: string; score: MemorizeScore }
  | { kind: 'summary' };

const isMemorizeSource = isOneOf(['random', 'curated'] as const);

function isMemorizePhase(v: unknown): v is MemorizePhaseSnapshot {
  if (!isRecord(v) || !isString(v.kind)) return false;
  switch (v.kind) {
    case 'settings':
    case 'summary':
      return true;
    case 'studying':
      return isFiniteNumber(v.index) && isString(v.fen) && isStudySeconds(v.studySeconds) && isFiniteNumber(v.endAt);
    case 'rebuilding':
      return isFiniteNumber(v.index) && isString(v.fen) && isStudySeconds(v.studySeconds) && isFiniteNumber(v.startAt) && isString(v.placement);
    case 'reviewed':
      return (
        isFiniteNumber(v.index) &&
        isString(v.fen) &&
        isStudySeconds(v.studySeconds) &&
        isFiniteNumber(v.rebuildMs) &&
        isString(v.placement) &&
        isMemorizeScore(v.score)
      );
    default:
      return false;
  }
}

export interface MemorizeSnapshot {
  studySeconds: StudySeconds;
  source: MemorizeSource;
  /** This session's positions (random picks or curated draws), stored whole so a reload never
   * re-rolls them — the learner would otherwise see a different position than the one they were
   * mid-study or mid-rebuild on. */
  sessionFens: string[];
  results: MemorizeResultSnapshot[];
  phase: MemorizePhaseSnapshot;
}

export const VT_MEMORIZE_KEY = 'human-chess.visualizationTrainer.memorize.v1';

export function freshMemorizeSnapshot(studySeconds: StudySeconds, source: MemorizeSource): MemorizeSnapshot {
  return { studySeconds, source, sessionFens: [], results: [], phase: { kind: 'settings' } };
}

export function parseMemorizeSnapshot(raw: unknown): MemorizeSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  const { studySeconds, source, sessionFens, results, phase } = raw;
  if (!isStudySeconds(studySeconds) || !isMemorizeSource(source)) return undefined;
  if (!isStringArray(sessionFens) || sessionFens.length > MEMORIZE_ROUNDS || !sessionFens.every(isLegalFen)) return undefined;
  if (!Array.isArray(results) || !results.every(isMemorizeResult)) return undefined;
  if (!isMemorizePhase(phase)) return undefined;
  // Every mid-session phase needs an index inside the stored sessionFens, and the position it
  // names to match — a stale/corrupt combination is rejected as a whole, never half-restored.
  if (phase.kind !== 'settings' && phase.kind !== 'summary') {
    if (phase.index < 0 || phase.index >= sessionFens.length || sessionFens[phase.index] !== phase.fen) return undefined;
  }
  // results is built up one entry per completed round as the session progresses: studying/
  // rebuilding haven't recorded this round's result yet (results.length === phase.index), while
  // reviewed has (results.length === phase.index + 1). A mismatch means a stale/corrupt snapshot.
  if (phase.kind === 'studying' || phase.kind === 'rebuilding') {
    if (results.length !== phase.index) return undefined;
  }
  if (phase.kind === 'reviewed') {
    if (results.length !== phase.index + 1) return undefined;
  }
  return { studySeconds, source, sessionFens, results, phase };
}
