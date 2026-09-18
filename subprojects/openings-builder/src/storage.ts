// The whole repertoire (every opening) as one JSON array in localStorage. Guarded because
// storage can be missing (no browser) or throw (private mode, quota); on any failure the
// repertoire simply lives for this page only, same pattern as endgames-intro/src/progress.ts.
import { EXPLORER_RATING_BUCKETS } from '@human-chess/lichess';
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

// The Explorer panel's rating band (min/max over EXPLORER_RATING_BUCKETS). Same guarded-
// localStorage pattern as depth above.
const EXPLORER_BAND_KEY = 'human-chess.openings.explorerBand.v1';
export const DEFAULT_EXPLORER_MIN = 1600;
export const DEFAULT_EXPLORER_MAX = 2000;

export interface ExplorerBand {
  min: number;
  max: number;
}

const DEFAULT_EXPLORER_BAND: ExplorerBand = { min: DEFAULT_EXPLORER_MIN, max: DEFAULT_EXPLORER_MAX };

function isRatingBucket(n: number): boolean {
  return (EXPLORER_RATING_BUCKETS as readonly number[]).includes(n);
}

function isBandLike(v: unknown): v is { min: unknown; max: unknown } {
  return typeof v === 'object' && v !== null && 'min' in v && 'max' in v;
}

export function loadExplorerBand(): ExplorerBand {
  try {
    const raw = globalThis.localStorage?.getItem(EXPLORER_BAND_KEY);
    if (!raw) return DEFAULT_EXPLORER_BAND;
    const parsed: unknown = JSON.parse(raw);
    if (!isBandLike(parsed) || typeof parsed.min !== 'number' || typeof parsed.max !== 'number') {
      return DEFAULT_EXPLORER_BAND;
    }
    const { min, max } = parsed;
    if (!isRatingBucket(min) || !isRatingBucket(max) || min > max) return DEFAULT_EXPLORER_BAND;
    return { min, max };
  } catch {
    return DEFAULT_EXPLORER_BAND;
  }
}

export function saveExplorerBand(band: ExplorerBand): void {
  try {
    globalThis.localStorage?.setItem(EXPLORER_BAND_KEY, JSON.stringify(band));
  } catch {
    // storage unavailable: band choice lives for this page only
  }
}

// Drill scope: one opening, several picked by checkbox, or every opening of the current
// colour (memory/subprojects/openings-builder-trainer.md, "Deviation handling in drill mode").
// Only the scope choice itself is persisted, same guarded-localStorage pattern as depth above —
// the task calls for persisting "the last scope choice", not the specific checkbox picks within
// 'several', which are reasonably a fresh decision each session.
export type DrillScope = 'one' | 'several' | 'all';
const DRILL_SCOPE_KEY = 'human-chess.openings.drillScope.v1';
export const DEFAULT_DRILL_SCOPE: DrillScope = 'one';

function isDrillScope(value: unknown): value is DrillScope {
  return value === 'one' || value === 'several' || value === 'all';
}

export function loadDrillScope(): DrillScope {
  try {
    const raw = globalThis.localStorage?.getItem(DRILL_SCOPE_KEY);
    return isDrillScope(raw) ? raw : DEFAULT_DRILL_SCOPE;
  } catch {
    return DEFAULT_DRILL_SCOPE;
  }
}

export function saveDrillScope(scope: DrillScope): void {
  try {
    globalThis.localStorage?.setItem(DRILL_SCOPE_KEY, scope);
  } catch {
    // storage unavailable: scope choice lives for this page only
  }
}
