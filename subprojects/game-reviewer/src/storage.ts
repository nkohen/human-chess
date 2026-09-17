// Persisted review settings: search depth and a per-position time cap. Same guarded-
// localStorage pattern as the openings builder's depth setting
// (subprojects/openings-builder/src/storage.ts) — reads and writes never throw, and a bad or
// missing stored value falls back to the default rather than sinking the screen.
//
// Timing (2026-09-17): depth 20 alone let a single complex position run the single-threaded
// wasm engine past packages/engine's own 60s+grace analyse() timeout ("no answer to go depth
// 20 within 65000 ms") on a real chess.com game. The movetime cap below bounds every
// position's search so the engine stops at whichever of depth/movetime comes first; the depth
// actually reached is read back from the engine's own report (ReviewedMove.provenance), never
// assumed to be the requested depth.

const DEPTH_KEY = 'human-chess.game-reviewer.depth';
export const DEFAULT_DEPTH = 20;
export const MIN_DEPTH = 6;
export const MAX_DEPTH = 30;

function clampDepth(depth: number): number {
  return Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, Math.round(depth)));
}

export function loadDepth(): number {
  try {
    const raw = globalThis.localStorage?.getItem(DEPTH_KEY);
    if (!raw) return DEFAULT_DEPTH;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_DEPTH;
    return clampDepth(n);
  } catch {
    return DEFAULT_DEPTH;
  }
}

export function saveDepth(depth: number): void {
  try {
    globalThis.localStorage?.setItem(DEPTH_KEY, String(clampDepth(depth)));
  } catch {
    // storage unavailable: depth choice lives for this page only
  }
}

const MOVETIME_SECONDS_KEY = 'human-chess.game-reviewer.movetime-seconds';
export const DEFAULT_MOVETIME_SECONDS = 5;
export const MIN_MOVETIME_SECONDS = 1;
export const MAX_MOVETIME_SECONDS = 60;

function clampMovetimeSeconds(seconds: number): number {
  return Math.min(MAX_MOVETIME_SECONDS, Math.max(MIN_MOVETIME_SECONDS, Math.round(seconds)));
}

export function loadMovetimeSeconds(): number {
  try {
    const raw = globalThis.localStorage?.getItem(MOVETIME_SECONDS_KEY);
    if (!raw) return DEFAULT_MOVETIME_SECONDS;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_MOVETIME_SECONDS;
    return clampMovetimeSeconds(n);
  } catch {
    return DEFAULT_MOVETIME_SECONDS;
  }
}

export function saveMovetimeSeconds(seconds: number): void {
  try {
    globalThis.localStorage?.setItem(MOVETIME_SECONDS_KEY, String(clampMovetimeSeconds(seconds)));
  } catch {
    // storage unavailable: time cap choice lives for this page only
  }
}
