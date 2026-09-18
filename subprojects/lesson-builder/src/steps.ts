// Pure step-list edits for the editor's Steps panel: reorder, insert, remove. Kept free of React
// and of @human-chess/lessons validation (the caller always has a `LessonStep[]` that already
// came from a valid Lesson) so the reorder/insert/remove logic is trivially unit-testable.
import type { LessonStep } from '@human-chess/lessons';

/** Swaps the step at `index` with its neighbour in `direction`; a no-op (same array reference
 * semantics aside — a fresh array is still returned) if there is no such neighbour, so a caller
 * can always spread the result without checking bounds first. */
export function moveStep(steps: readonly LessonStep[], index: number, direction: -1 | 1): LessonStep[] {
  const target = index + direction;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return steps.slice();
  const next = steps.slice();
  const a = next[index]!;
  const b = next[target]!;
  next[index] = b;
  next[target] = a;
  return next;
}

/** Inserts `step` at `index`, clamped into range so a caller never has to guard it (e.g.
 * inserting after the last step by passing `steps.length`). */
export function insertStep(steps: readonly LessonStep[], index: number, step: LessonStep): LessonStep[] {
  const at = Math.min(Math.max(index, 0), steps.length);
  const next = steps.slice();
  next.splice(at, 0, step);
  return next;
}

/** Removes the step at `index`; out-of-range is a no-op (still returns a fresh array). */
export function removeStep(steps: readonly LessonStep[], index: number): LessonStep[] {
  if (index < 0 || index >= steps.length) return steps.slice();
  const next = steps.slice();
  next.splice(index, 1);
  return next;
}
