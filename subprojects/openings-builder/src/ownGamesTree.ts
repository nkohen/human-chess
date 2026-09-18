// Shared "own games" position-graph derivation for both BuilderView's inline "Your games" panel
// and GamesTreeView's own dedicated "Your games" screen: sources -> selected sources (honouring
// the persisted filter.sourceKeys, dropping keys for removed accounts) -> selected games ->
// GameFilter -> buildTree. Extracted (task: bring openingtree-style own-games stats into Build
// mode, 2026-09-18) so this chain lives in exactly one place instead of being duplicated between
// the two views that now both need it. Every pure step below is unit-tested without React
// (ownGamesTree.test.ts); `useOwnGamesTree` is the hook both views call — GamesTreeView keeps
// feeding it the live source list from SourcesPanel's onSourcesChanged (unchanged), while
// BuilderView lists sources itself once on mount (it never syncs; syncing stays in Your games
// mode, so a one-shot `getGamesStore().listSources()` is all it needs — see BuilderView.tsx).
import { useEffect, useMemo, useState } from 'react';
import type { StoredImportedGame } from '@human-chess/import';
import { buildTree, childrenOf, type GameFilter, type GamesTree, type TreeMove } from '@human-chess/opening-tree';
import type { Color } from '@human-chess/rules';
import type { GameSource } from '@human-chess/store';
import { getGamesStore } from './gamesStore';
import { endOfDayIso, sourceKey, type YourGamesFilterState } from './treeHelpers';

export interface SourceGames {
  source: GameSource;
  games: StoredImportedGame[];
}

/** Which of `sources` the tree is folded from: `sourceKeys` (empty = all), with any key naming
 * an account that's since been removed dropped first — a stale key must never lock the tree onto
 * an unsatisfiable "0 of 0 games" empty remainder (GamesTreeView's original reasoning for this,
 * ported unchanged). */
export function selectSources(sources: GameSource[], sourceKeys: string[]): GameSource[] {
  const live = new Set(sources.map(sourceKey));
  const liveKeys = sourceKeys.filter(k => live.has(k));
  return liveKeys.length === 0 ? sources : sources.filter(s => liveKeys.includes(sourceKey(s)));
}

/** The games belonging to `selectedSources`, flattened out of `gamesBySource` (already-loaded
 * per-source game lists — see `useOwnGamesTree`'s own loading effect). */
export function gamesForSources(gamesBySource: SourceGames[], selectedSources: GameSource[]): StoredImportedGame[] {
  const selectedKeys = new Set(selectedSources.map(sourceKey));
  return gamesBySource.filter(entry => selectedKeys.has(sourceKey(entry.source))).flatMap(entry => entry.games);
}

/** `YourGamesFilterState` (the filter form's own shape) as `@human-chess/opening-tree`'s
 * `GameFilter` — `until` is bumped to the end of that calendar day (see `endOfDayIso`'s own
 * comment: a bare date parses as that day's midnight, which would otherwise exclude every game
 * played later the same day). */
export function toGameFilter(filter: YourGamesFilterState): GameFilter {
  return {
    speeds: filter.speeds.length > 0 ? filter.speeds : undefined,
    rated: filter.rated === 'all' ? undefined : filter.rated === 'rated',
    opponentRatingMin: filter.opponentRatingMin,
    opponentRatingMax: filter.opponentRatingMax,
    opponent: filter.opponent.trim() !== '' ? filter.opponent : undefined,
    since: filter.since || undefined,
    until: filter.until ? endOfDayIso(filter.until) : undefined,
  };
}

export interface OwnGameRow {
  move: TreeMove;
  /** Whether this exact move (by uci) is already an edge of the repertoire opening at this
   * position. */
  inTree: boolean;
  /** A move the tracked player actually played in their own games at this position that is NOT
   * (yet) in the repertoire being built — the point of this panel. Only meaningful, and only ever
   * true, on the tracked player's own turn: on the opponent's turn every row is a reply an
   * opponent played, not a decision the repertoire's author made, so there is nothing to diverge
   * from. A pure set-membership fact, nothing computed or judged (A1/V3). */
  divergence: boolean;
}

/**
 * The own-games tree's rows for `epd`, in the tree's own node order (count descending — the same
 * order `childrenOf`/`TreeNode.moves` already keep), each annotated against `repertoireChildren`
 * (the repertoire opening's own edges at this exact position, e.g. `childrenOf(opening, epd)`)
 * and `turnIsOwn` (whether it is the tracked player's own move here). Pure and React-free so it's
 * unit-testable without mounting anything (ownGamesTree.test.ts).
 */
export function rowsForPosition(tree: GamesTree, epd: string, repertoireChildren: ReadonlyArray<{ uci: string }>, turnIsOwn: boolean): OwnGameRow[] {
  const repertoireUcis = new Set(repertoireChildren.map(m => m.uci));
  return childrenOf(tree, epd).map(move => {
    const inTree = repertoireUcis.has(move.uci);
    return { move, inTree, divergence: turnIsOwn && !inTree };
  });
}

export interface UseOwnGamesTreeArgs {
  sources: GameSource[];
  color: Color;
  filter: YourGamesFilterState;
}

export interface UseOwnGamesTreeResult {
  tree: GamesTree;
  selectedSources: GameSource[];
  selectedGames: StoredImportedGame[];
  /** True while the games-loading effect's promise for the current `sources` is in flight; false
   * once it settles, success or failure. */
  loading: boolean;
  loadError: string | undefined;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Loads every game for `sources` from the shared games store and folds the ones selected by
 * `filter.sourceKeys` into a `GamesTree` for `color`, through `filter`'s `GameFilter`. Both
 * BuilderView and GamesTreeView call this with the same shape of inputs; only where `sources` and
 * `filter` come from differs between them (see this file's header comment). `buildTree` itself
 * only re-runs when `selectedGames`/`players`/`color`/`gameFilter` actually change — never on a
 * path/cursor change, since none of those are inputs here (BuilderView's own performance
 * requirement: the tree is not rebuilt on every move).
 */
export function useOwnGamesTree({ sources, color, filter }: UseOwnGamesTreeArgs): UseOwnGamesTreeResult {
  const [gamesBySource, setGamesBySource] = useState<SourceGames[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const store = getGamesStore();
        const lists = await Promise.all(sources.map(async source => ({ source, games: await store.listGames(source) })));
        if (!cancelled) {
          setGamesBySource(lists);
          setLoadError(undefined);
        }
      } catch (err: unknown) {
        if (!cancelled) setLoadError(errMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sources]);

  const selectedSources = useMemo(() => selectSources(sources, filter.sourceKeys), [sources, filter.sourceKeys]);
  const selectedGames = useMemo(() => gamesForSources(gamesBySource, selectedSources), [gamesBySource, selectedSources]);
  const players = useMemo(() => selectedSources.map(s => ({ site: s.site, username: s.username })), [selectedSources]);
  const gameFilter = useMemo(() => toGameFilter(filter), [filter]);
  const tree = useMemo(() => buildTree(selectedGames, { players, color, filter: gameFilter }), [selectedGames, players, color, gameFilter]);

  return { tree, selectedSources, selectedGames, loading, loadError };
}
