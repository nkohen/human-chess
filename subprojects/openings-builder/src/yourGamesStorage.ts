// Guarded-localStorage persistence for the "Your games" analysis view — same pattern as
// storage.ts (storage can be missing or throw; every load/save tolerates that and falls back to
// a sane default rather than sinking the view). Kept in its own file since it's a distinct screen
// from build/drill's own persisted choices.
import type { Color } from '@human-chess/rules';
import { DEFAULT_FILTER_STATE, parseFilterState, serializeFilterState, type YourGamesFilterState } from './treeHelpers';

const FILTER_KEY = 'human-chess.openings.gamesTree.filter.v1';

export function loadGamesTreeFilter(): YourGamesFilterState {
  try {
    return parseFilterState(globalThis.localStorage?.getItem(FILTER_KEY));
  } catch {
    return DEFAULT_FILTER_STATE;
  }
}

export function saveGamesTreeFilter(state: YourGamesFilterState): void {
  try {
    globalThis.localStorage?.setItem(FILTER_KEY, serializeFilterState(state));
  } catch {
    // storage unavailable: the filter just won't be remembered next time
  }
}

const COLOR_KEY = 'human-chess.openings.gamesTree.color.v1';
export const DEFAULT_GAMES_TREE_COLOR: Color = 'white';

export function loadGamesTreeColor(): Color {
  try {
    const raw = globalThis.localStorage?.getItem(COLOR_KEY);
    return raw === 'white' || raw === 'black' ? raw : DEFAULT_GAMES_TREE_COLOR;
  } catch {
    return DEFAULT_GAMES_TREE_COLOR;
  }
}

export function saveGamesTreeColor(color: Color): void {
  try {
    globalThis.localStorage?.setItem(COLOR_KEY, color);
  } catch {
    // storage unavailable: colour choice lives for this page only
  }
}

// maxGames: how many games a sync stops at once the store crosses this count for an account
// (packages/import's syncSourceGames). 2000 is a first guess (memory/subprojects/
// openings-builder-trainer.md) — not measured against a real account's full history.
const MAX_GAMES_KEY = 'human-chess.openings.gamesTree.maxGames.v1';
export const DEFAULT_MAX_GAMES = 2000;
export const MIN_MAX_GAMES = 100;
export const MAX_MAX_GAMES = 5000;

function clampMaxGames(n: number): number {
  return Math.min(MAX_MAX_GAMES, Math.max(MIN_MAX_GAMES, Math.round(n)));
}

export function loadMaxGames(): number {
  try {
    const raw = globalThis.localStorage?.getItem(MAX_GAMES_KEY);
    if (!raw) return DEFAULT_MAX_GAMES;
    const n = Number(raw);
    return Number.isFinite(n) ? clampMaxGames(n) : DEFAULT_MAX_GAMES;
  } catch {
    return DEFAULT_MAX_GAMES;
  }
}

export function saveMaxGames(n: number): void {
  try {
    globalThis.localStorage?.setItem(MAX_GAMES_KEY, String(clampMaxGames(n)));
  } catch {
    // storage unavailable: max-games choice lives for this page only
  }
}

// minGames: how many games a diagnostics entry (worstMoves/mostLostPositions) needs before it's
// shown — same default as @human-chess/opening-tree's own DiagnosticOpts default (5), first
// guess, persisted per browser.
const MIN_GAMES_KEY = 'human-chess.openings.gamesTree.minGames.v1';
export const DEFAULT_MIN_GAMES = 5;
export const MIN_MIN_GAMES = 1;
export const MAX_MIN_GAMES = 1000;

function clampMinGames(n: number): number {
  return Math.min(MAX_MIN_GAMES, Math.max(MIN_MIN_GAMES, Math.round(n)));
}

export function loadMinGames(): number {
  try {
    const raw = globalThis.localStorage?.getItem(MIN_GAMES_KEY);
    if (!raw) return DEFAULT_MIN_GAMES;
    const n = Number(raw);
    return Number.isFinite(n) ? clampMinGames(n) : DEFAULT_MIN_GAMES;
  } catch {
    return DEFAULT_MIN_GAMES;
  }
}

export function saveMinGames(n: number): void {
  try {
    globalThis.localStorage?.setItem(MIN_GAMES_KEY, String(clampMinGames(n)));
  } catch {
    // storage unavailable: min-games choice lives for this page only
  }
}

// The add-source form's last-picked site (lichess/chess.com) — a small local hook/pattern rather
// than @human-chess/import/react's useLastUsername (that one only remembers a single username,
// not a per-site draft plus which site was last chosen for a *new* source).
const ADD_SITE_KEY = 'human-chess.openings.gamesTree.addSite.v1';

export function loadAddSourceSite(): 'lichess' | 'chess.com' {
  try {
    return globalThis.localStorage?.getItem(ADD_SITE_KEY) === 'chess.com' ? 'chess.com' : 'lichess';
  } catch {
    return 'lichess';
  }
}

export function saveAddSourceSite(site: 'lichess' | 'chess.com'): void {
  try {
    globalThis.localStorage?.setItem(ADD_SITE_KEY, site);
  } catch {
    // storage unavailable: site choice lives for this page only
  }
}
