// The one thing besides the lesson library this subproject persists (docs/design/2026-09-18-reload-survival.md):
// which of the three screens is showing, which lesson, which step, and — for the player only —
// whether the current step's challenge has already been solved (so a reload doesn't re-lock a
// step the learner already answered correctly), and the UCI moves played so far in a play-out
// step's game (so a reload resumes mid-game via useEngineGame's `initialMoves`, per the same
// design doc). Both `solved` and `moves` are meaningful only while `view` is 'player' and are
// reset on every step change (see LessonBuilder.tsx), which is the honest behaviour for "went
// back to a previous step" too — a player screen re-checks a challenge, or restarts a play-out
// game, it revisits rather than remembering it forever.
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString, isStringArray } from '@human-chess/ui';

export type LessonBuilderViewName = 'library' | 'editor' | 'player';

export interface LessonBuilderViewState {
  view: LessonBuilderViewName;
  lessonId?: string;
  stepIndex: number;
  solved: boolean;
  /** UCI moves played so far in the current step's play-out game, if any. */
  moves?: string[];
}

export const INITIAL_VIEW_STATE: LessonBuilderViewState = { view: 'library', stepIndex: 0, solved: false };

const isViewName = isOneOf(['library', 'editor', 'player'] as const);

/** Validates a persisted view snapshot; undefined (reject, fall back to INITIAL_VIEW_STATE) for
 * anything that doesn't fit the current shape. `lessonId` existing in the library is checked by
 * the caller (LessonBuilder.tsx), not here — this module only knows the shape, not the data. */
export function parseViewState(raw: unknown): LessonBuilderViewState | undefined {
  if (!isRecord(raw)) return undefined;
  if (!isViewName(raw.view)) return undefined;
  if (!isFiniteNumber(raw.stepIndex) || raw.stepIndex < 0) return undefined;
  if (raw.lessonId !== undefined && !isString(raw.lessonId)) return undefined;
  if (raw.solved !== undefined && !isBoolean(raw.solved)) return undefined;
  if (raw.moves !== undefined && !isStringArray(raw.moves)) return undefined;
  const state: LessonBuilderViewState = { view: raw.view, stepIndex: Math.trunc(raw.stepIndex), solved: raw.solved === true };
  if (isString(raw.lessonId)) state.lessonId = raw.lessonId;
  if (isStringArray(raw.moves)) state.moves = raw.moves;
  return state;
}
