// Pure scoring: no engine calls, no React. Every input here is a real Score from an
// engine Analysis (A1) — this module only reshapes it into bands and a grade.
// whitePerspective moved to @human-chess/engine (packages/engine/src/score.ts): it belongs
// with Score itself, not with this subproject's banding.
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

/** Which qualitative band a White-perspective score falls in. A mate always counts as winning for its side. */
export function band(score: Score): Band {
  if (score.type === 'mate') {
    // UCI 'mate 0' means the side to move is already mated; its sign is lost by negation. It cannot
    // occur here: generateSelfPlayPosition never returns a finished position (see its contract).
    return score.value >= 0 ? 'white-winning' : 'black-winning';
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
