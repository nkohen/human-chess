// The one thing besides the lesson library this subproject persists (docs/design/2026-09-18-reload-survival.md):
// which of the three screens is showing, which lesson, which step, and — for the player only —
// whether the current step's challenge has already been solved (so a reload doesn't re-lock a
// step the learner already answered correctly). `solved` is meaningful only while `view` is
// 'player' and the current step has a challenge; it is reset to false on every step change (see
// LessonBuilder.tsx), which is the honest behaviour for "went back to a previous step" too — a
// player screen re-checks a challenge it revisits, it does not remember it forever.
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString } from '@human-chess/ui';

export type LessonBuilderViewName = 'library' | 'editor' | 'player';

export interface LessonBuilderViewState {
  view: LessonBuilderViewName;
  lessonId?: string;
  stepIndex: number;
  solved: boolean;
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
  const state: LessonBuilderViewState = { view: raw.view, stepIndex: Math.trunc(raw.stepIndex), solved: raw.solved === true };
  if (isString(raw.lessonId)) state.lessonId = raw.lessonId;
  return state;
}
