// Pure scoring: no engine calls, no React. Every input here is a real Score from an
// engine Analysis (A1) — this module only reshapes it into bands and a grade.
// whitePerspective and formatPawns live in @human-chess/engine (packages/engine/src/score.ts):
// they belong with Score itself, not with this subproject's banding. Callers that need
// formatPawns import it from '@human-chess/engine' directly, not from here.
import type { Score } from '@human-chess/engine';

export type Band =
  | 'black-winning'
  | 'black-clear'
  | 'black-slight'
  | 'equal'
  | 'white-slight'
  | 'white-clear'
  | 'white-winning';

/** Centipawn band edges. A cp score at or beyond a threshold falls in that band or a stronger one. */
export const BAND_SLIGHT_CP = 30;
export const BAND_CLEAR_CP = 100;
export const BAND_WINNING_CP = 200;

/**
 * Which side a White-perspective mate score belongs to. UCI's "mate 0" means the side to move is
 * already mated; whitePerspective flips it for Black by negating, and `-0 >= 0` is still `true`
 * in JS, so a naive `value >= 0` misreads a mated Black's "mate 0" (now -0) as White mating.
 * Object.is distinguishes -0 from +0 to get the side right. In practice this game never shows a
 * finished position (generateSelfPlayPosition's contract), so mate 0 shouldn't occur here, but
 * the check is correct regardless.
 */
export function mateSide(score: Score): 'white' | 'black' {
  return Object.is(score.value, -0) ? 'black' : score.value >= 0 ? 'white' : 'black';
}

/** Which qualitative band a White-perspective score falls in. A mate always counts as winning for its side. */
export function band(score: Score): Band {
  if (score.type === 'mate') {
    return mateSide(score) === 'white' ? 'white-winning' : 'black-winning';
  }
  const cp = score.value;
  if (cp >= BAND_WINNING_CP) return 'white-winning';
  if (cp >= BAND_CLEAR_CP) return 'white-clear';
  if (cp >= BAND_SLIGHT_CP) return 'white-slight';
  if (cp <= -BAND_WINNING_CP) return 'black-winning';
  if (cp <= -BAND_CLEAR_CP) return 'black-clear';
  if (cp <= -BAND_SLIGHT_CP) return 'black-slight';
  return 'equal';
}

export function describeBand(b: Band): string {
  switch (b) {
    case 'white-winning': return 'White is winning';
    case 'white-clear': return 'White is clearly better';
    case 'white-slight': return 'White is slightly better';
    case 'equal': return 'The position is about equal';
    case 'black-slight': return 'Black is slightly better';
    case 'black-clear': return 'Black is clearly better';
    case 'black-winning': return 'Black is winning';
  }
}

/**
 * Grades a centipawn guess (White's perspective) against the truth (also White's perspective).
 * Distance is undefined when the truth is a mate score, since a guess in centipawns has no
 * well-defined distance from "mate in N".
 */
export function grade(guessCp: number, truth: Score): { sameBand: boolean; distanceCp: number | undefined } {
  const guessBand = band({ type: 'cp', value: guessCp });
  const truthBand = band(truth);
  const distanceCp = truth.type === 'cp' ? Math.abs(guessCp - truth.value) : undefined;
  return { sameBand: guessBand === truthBand, distanceCp };
}

/** The guess slider's range, White's perspective, in centipawns. */
export const SLIDER_MIN_CP = -1000;
export const SLIDER_MAX_CP = 1000;

/** Clamps a cp value (White's perspective) to the guess slider's range. Shared by `points`
 * (distance is computed after clamping) and EvalScale.tsx (marker position on the scale). */
export function clampCp(cp: number): number {
  return Math.max(SLIDER_MIN_CP, Math.min(SLIDER_MAX_CP, cp));
}

// GeoGuessr-style scoring: points fall off exponentially with the distance between guess and
// truth. Both constants are a first guess (user feedback, 2026-09-16, item 6) flagged here for
// the user to tune, not a researched curve.
export const MAX_POINTS = 5000;
export const DECAY_CP = 150;

/**
 * Points for a centipawn guess against the truth, both White's perspective. Distance is
 * computed after clamping both values to the slider's range; a mate score is clamped to ±1000
 * (whichever end matches its side) purely as a *scoring convention* to give "distance" a
 * meaning here — it is not an evaluation, and nothing else in this module or the UI treats a
 * mate as worth exactly 1000 cp (formatScore still reports the real mate score to the player).
 */
export function points(guessCp: number, truth: Score): number {
  const truthCp = truth.type === 'mate' ? (mateSide(truth) === 'white' ? SLIDER_MAX_CP : SLIDER_MIN_CP) : clampCp(truth.value);
  const distanceCp = Math.abs(clampCp(guessCp) - truthCp);
  return Math.round(MAX_POINTS * Math.exp(-distanceCp / DECAY_CP));
}
