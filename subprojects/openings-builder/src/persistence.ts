// Reload-survival: the snapshot shapes, storage keys, and pure parse/rebuild helpers behind
// every `usePersistedState` call in this subproject (docs/design/2026-09-18-reload-survival.md).
// Kept here, React-free, so each snapshot's parser is unit-testable without mounting a
// component (persistence.test.ts) — the same reasoning as repertoire.ts/drill.ts/treeHelpers.ts.
//
// The rule this file follows throughout: never store a chessops Position or a derived tree
// node, only plain JSON (strings, arrays, small records) — a board position is a UCI list
// replayed through @human-chess/rules or rebuilt through `childrenOf`, never stored as an
// object. A `parse` that cannot fully validate a snapshot returns undefined, rejecting the
// whole thing (usePersistedState then falls back to the initial value) rather than
// half-restoring.
import type { GamesTree, TreeMove } from '@human-chess/opening-tree';
import { childrenOf as gamesChildrenOf } from '@human-chess/opening-tree';
import { playUci, positionFromFen, repetitionKey, type Color } from '@human-chess/rules';
import { isOneOf, isRecord, isString, isStringArray } from '@human-chess/ui';
import { childrenOf as repertoireChildrenOf, type Opening, type OpeningMove } from './repertoire';

// --- generic path rebuilding, shared by BuilderView and GamesTreeView -------------------------

/**
 * Walks `ucis` from `root`, following `childrenAt(epd)` one move at a time, and stops
 * (truncating the returned path) at the first uci with no matching edge — the underlying tree
 * may have been edited (an opening) or simply not contain that continuation (a games tree)
 * since the path was saved. Never throws: an empty or fully-invalid `ucis` list just yields an
 * empty path (root).
 */
export function pathFromUciLine<M extends { uci: string; to: string }>(root: string, childrenAt: (epd: string) => M[], ucis: readonly string[]): M[] {
  const path: M[] = [];
  let epd = root;
  for (const uci of ucis) {
    const step = childrenAt(epd).find(child => child.uci === uci);
    if (!step) break;
    path.push(step);
    epd = step.to;
  }
  return path;
}

// --- OpeningsBuilder.tsx: selectedId, mode, severalIds, new-opening draft ----------------------

export type Mode = 'build' | 'drill' | 'games';

export interface BuilderStateSnapshot {
  /** `null`, not `undefined`, so a real "nothing selected" is distinguishable in JSON from a
   * rejected/missing entry (which usePersistedState represents as `undefined`). */
  selectedId: string | null;
  mode: Mode;
  severalIds: string[];
  newName: string;
  newColor: Color;
}

export const BUILDER_STATE_KEY = 'human-chess.openings.builderState.v1';

const isMode = isOneOf(['build', 'drill', 'games'] as const);
const isColor = isOneOf(['white', 'black'] as const);

export function parseBuilderState(raw: unknown): BuilderStateSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw['selectedId'] !== null && !isString(raw['selectedId'])) return undefined;
  if (!isMode(raw['mode'])) return undefined;
  if (!isStringArray(raw['severalIds'])) return undefined;
  if (!isString(raw['newName'])) return undefined;
  if (!isColor(raw['newColor'])) return undefined;
  return {
    selectedId: raw['selectedId'] as string | null,
    mode: raw['mode'],
    severalIds: raw['severalIds'],
    newName: raw['newName'],
    newColor: raw['newColor'],
  };
}

// --- BuilderView.tsx: path, from the opening's root ---------------------------------------------

export interface BuildPathSnapshot {
  openingId: string;
  ucis: string[];
}

export const BUILD_PATH_KEY = 'human-chess.openings.buildPath.v1';

export function parseBuildPathSnapshot(raw: unknown): BuildPathSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  if (!isString(raw['openingId'])) return undefined;
  if (!isStringArray(raw['ucis'])) return undefined;
  return { openingId: raw['openingId'], ucis: raw['ucis'] };
}

/**
 * Rebuilds a path of OpeningMove edges from `opening`'s root by walking `ucis` through
 * `childrenOf`, truncating at the first uci the opening no longer has (it may have been edited
 * since the path was saved). Every opening is rooted at the same starting position (EPD of
 * START_FEN — `createOpening`), so the root alone can't tell openings apart; callers must check
 * `BuildPathSnapshot.openingId` against the opening actually being viewed before calling this,
 * or a path saved for one opening could partially replay against an unrelated one that happens
 * to share early moves.
 */
export function rebuildBuildPath(opening: Opening, ucis: readonly string[]): OpeningMove[] {
  return pathFromUciLine(opening.root, epd => repertoireChildrenOf(opening, epd), ucis);
}

// --- DrillView.tsx: trail, drillStatus, expected, seeded with the scope key --------------------

export type DrillStatus = 'playing' | 'wrong' | 'complete';

export interface DrillExpectedEntry {
  san: string;
  openingNames: string[];
}

export interface DrillSnapshot {
  /** The selected-openings scope this trail was recorded against (DrillView's own `scopeKey`) —
   * doubles as the sentinel that detects a scope change, exactly like the `drillScopeKey` state
   * it replaces: a snapshot whose `scopeKey` doesn't match the current scope is stale and is
   * rejected wholesale rather than partially applied. */
  scopeKey: string;
  trail: string[];
  status: DrillStatus;
  expected: DrillExpectedEntry[];
}

export const DRILL_STATE_KEY = 'human-chess.openings.drillState.v1';

const isDrillStatus = isOneOf(['playing', 'wrong', 'complete'] as const);

function isDrillExpectedEntry(v: unknown): v is DrillExpectedEntry {
  return isRecord(v) && isString(v['san']) && isStringArray(v['openingNames']);
}

function isDrillExpectedArray(v: unknown): v is DrillExpectedEntry[] {
  return Array.isArray(v) && v.every(isDrillExpectedEntry);
}

export function parseDrillSnapshot(raw: unknown): DrillSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  if (!isString(raw['scopeKey'])) return undefined;
  if (!isStringArray(raw['trail'])) return undefined;
  if (!isDrillStatus(raw['status'])) return undefined;
  if (!isDrillExpectedArray(raw['expected'])) return undefined;
  return { scopeKey: raw['scopeKey'], trail: raw['trail'], status: raw['status'], expected: raw['expected'] };
}

/**
 * Replays `trail` (UCI moves) from `root` through the rules library, returning the resulting
 * EPD — DrillView's `epd` is always this, never stored on its own (it's fully determined by
 * `root` + `trail`). Returns undefined (never throws) if any move is illegal, so a corrupt or
 * incompatible trail rejects the whole snapshot rather than landing on a bogus position.
 */
export function replayTrail(root: string, trail: readonly string[]): string | undefined {
  let epd = root;
  try {
    for (const uci of trail) {
      const played = playUci(positionFromFen(epd), uci);
      epd = repetitionKey(played.pos);
    }
  } catch {
    return undefined;
  }
  return epd;
}

// --- GamesTreeView.tsx: path, as a UCI list -----------------------------------------------------

export const GAMES_PATH_KEY = 'human-chess.openings.gamesPath.v1';

export function parseGamesPathUcis(raw: unknown): string[] | undefined {
  return isStringArray(raw) ? raw : undefined;
}

/**
 * Rebuilds a path of TreeMove edges from `tree`'s root by walking `ucis` through `childrenOf`,
 * truncating at the first uci the current tree doesn't have — a fresh sync, a changed filter, or
 * a changed colour can all make an old path partially (or wholly) invalid. Unlike
 * `rebuildBuildPath`, there's no separate identity to check first: `tree` is always exactly "the
 * one games tree currently in view", so truncation alone is the whole reconciliation.
 */
export function rebuildGamesPath(tree: GamesTree, ucis: readonly string[]): TreeMove[] {
  return pathFromUciLine(tree.root, epd => gamesChildrenOf(tree, epd), ucis);
}

// --- MoveTree.tsx: expanded/showAll sets --------------------------------------------------------

export const MOVE_TREE_EXPANDED_KEY = 'human-chess.openings.moveTreeExpanded.v1';
export const MOVE_TREE_SHOW_ALL_KEY = 'human-chess.openings.moveTreeShowAll.v1';

/** `Set<string>` <-> `string[]` for the `serialize`/`parse` pair `usePersistedState` takes for
 * non-JSON values (Set), same convention as packages/ui/src/persisted.test.ts's own example. */
export function parseMoveTreeKeySet(raw: unknown): Set<string> | undefined {
  return isStringArray(raw) ? new Set(raw) : undefined;
}

export function serializeMoveTreeKeySet(keys: Set<string>): string[] {
  return [...keys];
}

/**
 * Keeps only the entries of `keys` (MoveTree's `expanded`/`showAll`, each keyed by `pathKey` — a
 * space-joined uci sequence, `''` for the root) whose full uci sequence still resolves against
 * `tree` via `childrenOf` — the same truncate-on-validity idea as a path snapshot, applied to a
 * whole set of paths at once. Used on every tree change (not just on reload): the very first
 * "real" tree a fresh mount sees replaces an empty placeholder once the async games load
 * resolves, and a blind reset there would silently undo a just-restored snapshot before the
 * user ever saw it. The root key (`''`) always survives — it names the tree's own root, not a
 * walk through it, so it's never invalidated by a tree change.
 */
export function reconcileMoveTreeKeys(tree: GamesTree, keys: ReadonlySet<string>): Set<string> {
  const kept = new Set<string>();
  for (const key of keys) {
    if (key === '') {
      kept.add(key);
      continue;
    }
    const ucis = key.split(' ');
    let epd = tree.root;
    let ok = true;
    for (const uci of ucis) {
      const edge = gamesChildrenOf(tree, epd).find(m => m.uci === uci);
      if (!edge) {
        ok = false;
        break;
      }
      epd = edge.to;
    }
    if (ok) kept.add(key);
  }
  return kept;
}
