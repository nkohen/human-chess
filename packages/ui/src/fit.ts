/**
 * The largest square, in whole pixels, that fits inside a `widthPx` x `heightPx` box once
 * `gapPx` of breathing room is subtracted from each dimension. Pure and DOM-free so it can be
 * unit-tested directly (see fit.test.ts); `useFitSquare` (useFitSquare.ts) is the DOM-facing
 * hook built on top of it. Used by Workbench (layouts.tsx) to size a board to whatever is left
 * of its column's width and the viewport height under the app header, and replaces the memory
 * trainer's own squareSize (subprojects/memory-trainer/src/MemoryTrainer.tsx).
 */
export function fitSquare(widthPx: number, heightPx: number, gapPx: number): number {
  const side = Math.min(widthPx, heightPx) - gapPx;
  return Math.max(0, Math.floor(side));
}
