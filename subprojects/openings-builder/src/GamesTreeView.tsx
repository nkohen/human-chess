// "Your games": an openingtree.com-style analysis over the user's own synced lichess/chess.com
// games (memory/subprojects/openings-builder-trainer.md, priority 2). Games live in
// @human-chess/store (synced by packages/import's syncSourceGames, managed by SourcesPanel);
// folding into a position graph is @human-chess/opening-tree's buildTree; this file wires the
// sources list, the loaded games, the filter, the tree, the selected path (board position +
// move-tree highlight), and the diagnostics panel together. Display and navigation only — every
// number shown is read straight off the tree or the store (A1/V3).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import type { StoredImportedGame } from '@human-chess/import';
import { buildTree, fenAt, type GameFilter, type GamesTree, type TreeMove } from '@human-chess/opening-tree';
import { inCheck, positionFromFen, turn, uciSquares, START_FEN, type Color, type SquareName } from '@human-chess/rules';
import type { GameSource } from '@human-chess/store';
import { Button, Panel, SegmentedControl, Status, Toolbar, Workbench } from '@human-chess/ui';
import { Diagnostics } from './Diagnostics';
import { FilterBar } from './FilterBar';
import { getGamesStore } from './gamesStore';
import { GameRefList, MoveTree } from './MoveTree';
import { SourcesPanel } from './SourcesPanel';
import { endOfDayIso, pathToUcis, sourceKey, type GamesTreeTarget, type YourGamesFilterState } from './treeHelpers';
import { loadGamesTreeColor, loadGamesTreeFilter, loadMinGames, saveGamesTreeColor, saveGamesTreeFilter, saveMinGames } from './yourGamesStorage';
import './yourGames.css';

export type { GamesTreeTarget } from './treeHelpers';

export interface GamesTreeViewProps {
  /** The opening picker / new-opening form / mode toggle, shared with BuilderView and DrillView.
   * Rendered as `primary`, same role it plays in both those views. */
  controls: ReactNode;
  /** The engine-failed-to-load banner, if any; rendered as Workbench's `status`, same as the
   * other two views (this view never calls the engine itself, but the banner is mode-agnostic). */
  status?: ReactNode;
  targetOpening?: GamesTreeTarget | undefined;
}

const NO_DESTS = new Map<SquareName, SquareName[]>();

const COLOR_OPTIONS: { value: Color; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
];

interface SourceGames {
  source: GameSource;
  games: StoredImportedGame[];
}

export function GamesTreeView({ controls, status, targetOpening }: GamesTreeViewProps): React.JSX.Element {
  const [sources, setSources] = useState<GameSource[]>([]);
  const [gamesBySource, setGamesBySource] = useState<SourceGames[]>([]);
  const [color, setColor] = useState<Color>(() => loadGamesTreeColor());
  const [filter, setFilter] = useState<YourGamesFilterState>(() => loadGamesTreeFilter());
  const [minGames, setMinGames] = useState<number>(() => loadMinGames());
  const [path, setPath] = useState<TreeMove[]>([]);
  const [expandRequest, setExpandRequest] = useState<{ path: TreeMove[]; token: number } | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const expandTokenRef = useRef(0);

  useEffect(() => saveGamesTreeColor(color), [color]);
  useEffect(() => saveGamesTreeFilter(filter), [filter]);
  useEffect(() => saveMinGames(minGames), [minGames]);

  // Loads every linked account's games whenever the source list changes — on mount (SourcesPanel's
  // own initial listSources()) and after every add/remove/sync, since SourcesPanel always hands
  // back a fresh array from the store (see its own comment on why reference identity is enough
  // to retrigger this even when only a game count changed, not the list of accounts itself).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = getGamesStore();
        const lists = await Promise.all(sources.map(async source => ({ source, games: await store.listGames(source) })));
        if (!cancelled) {
          setGamesBySource(lists);
          setLoadError(undefined);
        }
      } catch (err: unknown) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sources]);

  // Which linked accounts feed the tree at all — filter.sourceKeys (empty = all), a different
  // axis from GameFilter.sources below (that one filters by host type per game, not by which of
  // *your* accounts a game came from). A persisted sourceKeys can name an account that's since
  // been removed (localStorage outlives the account); dropping keys not present in the current
  // `sources` before deciding "empty = all" means a removed account can never lock the tree onto
  // an empty remainder ("0 of 0 games match") that nothing can ever satisfy again.
  const selectedSources = useMemo(() => {
    const live = new Set(sources.map(sourceKey));
    const liveKeys = filter.sourceKeys.filter(k => live.has(k));
    return liveKeys.length === 0 ? sources : sources.filter(s => liveKeys.includes(sourceKey(s)));
  }, [sources, filter.sourceKeys]);

  const selectedGames = useMemo(() => {
    const selectedKeys = new Set(selectedSources.map(sourceKey));
    return gamesBySource.filter(entry => selectedKeys.has(sourceKey(entry.source))).flatMap(entry => entry.games);
  }, [gamesBySource, selectedSources]);

  const players = useMemo(() => selectedSources.map(s => ({ site: s.site, username: s.username })), [selectedSources]);

  const gameFilter: GameFilter = useMemo(
    () => ({
      speeds: filter.speeds.length > 0 ? filter.speeds : undefined,
      rated: filter.rated === 'all' ? undefined : filter.rated === 'rated',
      opponentRatingMin: filter.opponentRatingMin,
      opponentRatingMax: filter.opponentRatingMax,
      opponent: filter.opponent.trim() !== '' ? filter.opponent : undefined,
      since: filter.since || undefined,
      until: filter.until ? endOfDayIso(filter.until) : undefined,
    }),
    [filter],
  );

  const tree: GamesTree = useMemo(() => buildTree(selectedGames, { players, color, filter: gameFilter }), [selectedGames, players, color, gameFilter]);

  // A newly built tree (a sync landed, the filter or colour changed) invalidates any
  // in-progress path — same "compare during render, reset if changed" trick v1 used, since an
  // effect would let one stale-tree render slip through first.
  const [treeForPath, setTreeForPath] = useState(tree);
  if (treeForPath !== tree) {
    setTreeForPath(tree);
    setPath([]);
    // A stale expandRequest (from a previous tree's Diagnostics "Show" click) targets TreeMoves
    // that may no longer exist once the tree's rebuilt — MoveTree resets its own expanded/showAll
    // state on the same tree-changed transition, so a leftover request here would have nothing
    // valid left to apply it to.
    setExpandRequest(undefined);
  }

  const currentEpd = path.length > 0 ? path[path.length - 1]!.to : tree.root;
  const fen = fenAt(currentEpd);
  const pos = useMemo(() => positionFromFen(fen), [fen]);
  const lastMove: [SquareName, SquareName] | undefined = path.length > 0 ? uciSquares(path[path.length - 1]!.uci) : undefined;
  const lastEdge = path.length > 0 ? path[path.length - 1] : undefined;

  /** Diagnostics' "Show" buttons: navigate the board to the entry's position AND ask MoveTree to
   * expand every ancestor along the way (a fresh token every time, even for the same entry
   * clicked twice — see MoveTree's own comment on why). */
  const showEntry = (entryPath: TreeMove[]): void => {
    setPath(entryPath);
    expandTokenRef.current += 1;
    setExpandRequest({ path: entryPath, token: expandTokenRef.current });
  };

  return (
    <Workbench
      title="Your games"
      status={status}
      primary={controls}
      aside={
        <div className="ob-aside-scroll">
          <SourcesPanel onSourcesChanged={setSources} />
          <Panel title="Colour">
            <SegmentedControl ariaLabel="Games tree colour" options={COLOR_OPTIONS} value={color} onChange={setColor} />
          </Panel>
          <FilterBar filter={filter} onChange={setFilter} sources={sources} matched={tree.gamesFolded} total={selectedGames.length} skipped={tree.skipped} />
        </div>
      }
      footer={
        <Toolbar>
          <Button variant="quiet" onClick={() => setPath([])} disabled={path.length === 0}>
            Back to start
          </Button>
          <Button variant="quiet" onClick={() => setPath(p => p.slice(0, -1))} disabled={path.length === 0}>
            Back
          </Button>
        </Toolbar>
      }
      board={sizePx => (
        <Board
          fen={fen}
          orientation={color}
          turnColor={turn(pos)}
          dests={NO_DESTS}
          movableColor={undefined}
          lastMove={lastMove}
          check={inCheck(pos)}
          onMove={() => {}}
          size={`${sizePx}px`}
        />
      )}
    >
      <div className="ob-path">
        {path.length > 0 ? (
          <MoveLine startFen={fenAt(tree.root)} ucis={pathToUcis(path)} orientation={color} />
        ) : (
          <Status kind="info">(start)</Status>
        )}
      </div>
      {loadError && <Status kind="error">Couldn't load your synced games: {loadError}</Status>}
      {sources.length === 0 ? (
        <Status kind="info">Link a lichess or chess.com account and sync to build your tree.</Status>
      ) : (
        <>
          <Panel title="Move tree">
            <MoveTree tree={tree} path={path} onNavigate={setPath} targetOpening={targetOpening} color={color} expandRequest={expandRequest} />
          </Panel>
          {lastEdge && (
            <Panel title="Games with this move">
              <GameRefList refs={lastEdge.games} />
            </Panel>
          )}
          <Diagnostics tree={tree} minGames={minGames} onMinGamesChange={setMinGames} onShow={showEntry} />
        </>
      )}
    </Workbench>
  );
}

// Kept for parity with v1 in case a future caller wants the plain starting FEN without a tree —
// not used inside this file (fenAt(tree.root) covers every real usage here).
export { START_FEN };
