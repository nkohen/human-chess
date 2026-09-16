// The whole repertoire (every opening) as one JSON array in localStorage. Guarded because
// storage can be missing (no browser) or throw (private mode, quota); on any failure the
// repertoire simply lives for this page only, same pattern as endgames-intro/src/progress.ts.
import { deserialize, serialize, type Opening } from './repertoire';

const KEY = 'human-chess.openings.v1';

export function loadRepertoire(): Opening[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const openings: Opening[] = [];
    for (const item of parsed) {
      try {
        openings.push(deserialize(JSON.stringify(item)));
      } catch {
        // one corrupt entry doesn't sink the rest
      }
    }
    return openings;
  } catch {
    return [];
  }
}

export function saveRepertoire(openings: Opening[]): void {
  try {
    globalThis.localStorage?.setItem(KEY, `[${openings.map(serialize).join(',')}]`);
  } catch {
    // storage unavailable: repertoire lives for this page only
  }
}

// The MultiPV panel's search depth. Same guarded-localStorage pattern as the repertoire
// above: reads and writes never throw, and a bad or missing stored value falls back to the
// default rather than sinking the panel.
const DEPTH_KEY = 'human-chess.openings.depth.v1';
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
