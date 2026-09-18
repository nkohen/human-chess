// The lesson content schema and its validation/serialisation. A "lesson" is an ordered list of
// steps; each step is a board position (a full FEN), some prose, optional board annotations
// (arrows/circles), and an optional move-challenge the learner must answer before continuing.
// This package is authored by the Lesson Builder subproject and read back by it (and by any
// future lesson player); it is the one place the lesson shape and its invariants live.
//
// Two rules from CLAUDE.md shape this package:
//   - Positions are never stored as objects — a step stores a FEN string that is rebuilt through
//     @human-chess/rules on read (positionFromFen), and every function here that touches a
//     position or a move goes through the rules library. There is no hand-written legality here.
//   - A1/V3: a challenge's accepted answers are validated as *legal moves* from the step's
//     position (playUci, which throws on an illegal or unparseable move). A lesson that claims a
//     move is correct can only have been built from a move the rules library accepts.
import { playUci, positionFromFen, type Color, type SquareName } from '@human-chess/rules';

/** chessground's four annotation brushes; a LessonShape reuses exactly these (see BoardShape in
 * @human-chess/board, which a LessonShape is assignable to). */
export type LessonBrush = 'green' | 'red' | 'blue' | 'yellow';
const LESSON_BRUSHES: readonly LessonBrush[] = ['green', 'red', 'blue', 'yellow'];

/** An arrow (both squares) or a circle over one square (`dest` omitted). */
export interface LessonShape {
  orig: SquareName;
  dest?: SquareName;
  brush: LessonBrush;
}

export interface LessonChallenge {
  /** UCI moves that count as correct from the step's position. Non-empty; each one legal there. */
  answers: string[];
  /** Optional instruction shown while the learner is trying (e.g. "Give a check"). */
  prompt?: string;
}

export interface LessonStep {
  id: string;
  /** Full FEN of the position shown; always a legal position (validated through the rules library). */
  fen: string;
  orientation: Color;
  /** Prose shown alongside the board. May be empty for a pure position/challenge step. */
  text: string;
  shapes: LessonShape[];
  /** Present exactly when this step asks the learner to play a move before continuing. */
  challenge?: LessonChallenge;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  steps: LessonStep[];
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
}

const SQUARE_RE = /^[a-h][1-8]$/;
const COLORS: readonly Color[] = ['white', 'black'];

// --- position / move helpers (the only rules-library callers a caller needs) ---------------

/** True when `fen` parses to a legal position. Never throws. */
export function isLegalFen(fen: string): boolean {
  try {
    positionFromFen(fen);
    return true;
  } catch {
    return false;
  }
}

/** True when `uci` is a legal move from `fen`. Never throws; a bad FEN or unparseable move is
 * simply not legal. This is the check the editor uses before accepting a challenge answer. */
export function isLegalMoveFrom(fen: string, uci: string): boolean {
  try {
    playUci(positionFromFen(fen), uci);
    return true;
  } catch {
    return false;
  }
}

/** The SAN of a legal move from `fen`, for display next to a challenge; undefined if not legal. */
export function sanOfMove(fen: string, uci: string): string | undefined {
  try {
    return playUci(positionFromFen(fen), uci).san;
  } catch {
    return undefined;
  }
}

/** Build a full, validated FEN from a piece-placement string (what BoardEditor hands back) and a
 * side to move, using the plain defaults a set-up position wants (no castling rights, no en
 * passant, fresh clocks). Throws if the result is not a legal position, so a caller can surface
 * "that isn't a legal position" instead of storing something the board can't render. */
export function composeFen(placement: string, turn: Color): string {
  const fen = `${placement.trim().split(/\s+/)[0]} ${turn === 'white' ? 'w' : 'b'} - - 0 1`;
  positionFromFen(fen); // throws RulesError on an illegal placement
  return fen;
}

// --- validation ------------------------------------------------------------------------------

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
function isSquare(x: unknown): x is SquareName {
  return typeof x === 'string' && SQUARE_RE.test(x);
}

export function parseLessonShape(raw: unknown): LessonShape | undefined {
  if (!isRecord(raw)) return undefined;
  if (!isSquare(raw.orig)) return undefined;
  if (raw.dest !== undefined && !isSquare(raw.dest)) return undefined;
  if (typeof raw.brush !== 'string' || !(LESSON_BRUSHES as readonly string[]).includes(raw.brush)) return undefined;
  const shape: LessonShape = { orig: raw.orig, brush: raw.brush as LessonBrush };
  if (isSquare(raw.dest)) shape.dest = raw.dest;
  return shape;
}

function parseChallenge(raw: unknown, fen: string): LessonChallenge | undefined {
  if (!isRecord(raw)) return undefined;
  if (!Array.isArray(raw.answers) || raw.answers.length === 0) return undefined;
  const answers: string[] = [];
  for (const a of raw.answers) {
    if (typeof a !== 'string' || !isLegalMoveFrom(fen, a)) return undefined; // A1/V3: only real legal moves
    answers.push(a);
  }
  const challenge: LessonChallenge = { answers };
  if (typeof raw.prompt === 'string') challenge.prompt = raw.prompt;
  return challenge;
}

/** Validate one step: a legal FEN, a real orientation, storable shapes, and — if present — a
 * challenge whose answers are all legal moves from that position. Returns undefined (reject) on
 * anything that doesn't fit the current shape, so a stale or hand-edited entry never crashes a
 * reader. */
export function parseLessonStep(raw: unknown): LessonStep | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.id !== 'string' || raw.id.length === 0) return undefined;
  if (typeof raw.fen !== 'string' || !isLegalFen(raw.fen)) return undefined;
  if (!(COLORS as readonly unknown[]).includes(raw.orientation)) return undefined;
  if (typeof raw.text !== 'string') return undefined;
  if (!Array.isArray(raw.shapes)) return undefined;
  const shapes: LessonShape[] = [];
  for (const s of raw.shapes) {
    const shape = parseLessonShape(s);
    if (!shape) return undefined;
    shapes.push(shape);
  }
  const step: LessonStep = { id: raw.id, fen: raw.fen, orientation: raw.orientation as Color, text: raw.text, shapes };
  if (raw.challenge !== undefined) {
    const challenge = parseChallenge(raw.challenge, raw.fen);
    if (!challenge) return undefined;
    step.challenge = challenge;
  }
  return step;
}

/** Validate a whole lesson. Steps must each validate (a single bad step rejects the lesson, so a
 * reader never shows a half-broken lesson); an empty step list is allowed (a new draft). */
export function parseLesson(raw: unknown): Lesson | undefined {
  if (!isRecord(raw)) return undefined;
  if (typeof raw.id !== 'string' || raw.id.length === 0) return undefined;
  if (typeof raw.title !== 'string') return undefined;
  if (typeof raw.description !== 'string') return undefined;
  if (typeof raw.createdAt !== 'number' || !Number.isFinite(raw.createdAt)) return undefined;
  if (typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return undefined;
  if (!Array.isArray(raw.steps)) return undefined;
  const steps: LessonStep[] = [];
  for (const s of raw.steps) {
    const step = parseLessonStep(s);
    if (!step) return undefined;
    steps.push(step);
  }
  return { id: raw.id, title: raw.title, description: raw.description, steps, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
}

/** Validate an array of lessons, dropping any that don't validate. For a stored library where one
 * corrupt lesson shouldn't lose the rest (unlike within a single lesson, where one bad step is
 * fatal). Returns undefined only when the top-level value isn't an array at all. */
export function parseLessonList(raw: unknown): Lesson[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(parseLesson).filter((l): l is Lesson => l !== undefined);
}

// --- import / export -------------------------------------------------------------------------

/** Bump when the on-disk/export shape changes. */
export const LESSON_FILE_VERSION = 1;

export interface LessonFile {
  version: number;
  lesson: Lesson;
}

/** The JSON a user exports from the builder and (later) a maintainer commits into the repo: a
 * version stamp plus the lesson, pretty-printed so a diff is readable. */
export function serializeLesson(lesson: Lesson): string {
  const file: LessonFile = { version: LESSON_FILE_VERSION, lesson };
  return JSON.stringify(file, null, 2);
}

/** Parse exported JSON back into a lesson. Accepts either the `{version, lesson}` wrapper or a
 * bare lesson object (so pasting just the lesson also works). Returns undefined on anything that
 * doesn't validate. Never throws. */
export function parseLessonFile(text: string): Lesson | undefined {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (isRecord(data) && 'version' in data && 'lesson' in data) return parseLesson((data as { lesson: unknown }).lesson);
  return parseLesson(data);
}

// --- construction ----------------------------------------------------------------------------

/** A fresh, empty lesson. `now` is injected (not read from Date) so callers and tests stay
 * deterministic. */
export function emptyLesson(id: string, now: number, title = 'Untitled lesson'): Lesson {
  return { id, title, description: '', steps: [], createdAt: now, updatedAt: now };
}

/** A fresh step at the standard starting position, oriented for White. Callers set the position
 * (via composeFen or a played line) and the rest before saving. */
export function emptyStep(id: string, fen: string, orientation: Color = 'white'): LessonStep {
  return { id, fen, orientation, text: '', shapes: [] };
}
