// "Your games": an openingtree.com-style analysis over the user's own synced lichess/chess.com
// games (memory/subprojects/openings-builder-trainer.md, priority 2). Games live in
// @human-chess/store (synced by packages/import's syncSourceGames, managed by SourcesPanel);
// folding into a position graph is @human-chess/opening-tree's buildTree; this file wires the
// sources list, the loaded games, the filter, the tree, the selected path (board position +
// move-tree highlight), and the diagnostics panel together. Display and navigation only — every
// number shown is read straight off the tree or the store (A1/V3).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import { fenAt, type TreeMove } from '@human-chess/opening-tree';
import { inCheck, positionFromFen, turn, uciSquares, START_FEN, type Color, type SquareName } from '@human-chess/rules';
import type { GameSource } from '@human-chess/store';
import { Button, Field, Panel, SegmentedControl, Status, Toolbar, usePersistedState, Workbench } from '@human-chess/ui';
import { Diagnostics } from './Diagnostics';
import { FilterBar } from './FilterBar';
import { GameRefList, MoveTree } from './MoveTree';
import { useOwnGamesTree } from './ownGamesTree';
import { GAMES_PATH_KEY, parseGamesPathUcis, rebuildGamesPath } from './persistence';
import { SourcesPanel } from './SourcesPanel';
import { formatLastPlayed, pathToUcis, type GamesTreeTarget, type YourGamesFilterState } from './treeHelpers';
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

export function GamesTreeView({ controls, status, targetOpening }: GamesTreeViewProps): React.JSX.Element {
  const [sources, setSources] = useState<GameSource[]>([]);
  const [color, setColor] = useState<Color>(() => loadGamesTreeColor());
  const [filter, setFilter] = useState<YourGamesFilterState>(() => loadGamesTreeFilter());
  const [minGames, setMinGames] = useState<number>(() => loadMinGames());
  // The board/tree cursor, persisted as a UCI list from the tree's root — there's no separate
  // "which tree" identity to key against here (unlike BuilderView's per-opening path): `tree`
  // below is always exactly "the one games tree currently in view" for the current sources/
  // filter/colour, so rebuilding-and-truncating against it on every render (not just at mount)
  // is the whole reconciliation. A fresh sync, a changed filter, or a changed colour that
  // invalidates part of the saved path just truncates it instead of wiping it to the root.
  const [pathUcis, setPathUcis] = usePersistedState<string[]>(GAMES_PATH_KEY, [], { parse: parseGamesPathUcis });
  const [expandRequest, setExpandRequest] = useState<{ path: TreeMove[]; token: number } | undefined>(undefined);
  const expandTokenRef = useRef(0);

  useEffect(() => saveGamesTreeColor(color), [color]);
  useEffect(() => saveGamesTreeFilter(filter), [filter]);
  useEffect(() => saveMinGames(minGames), [minGames]);

  // Sources -> selected sources (honouring filter.sourceKeys) -> selected games -> GameFilter ->
  // buildTree, and the games-loading effect that feeds it, all live in ownGamesTree.ts now — the
  // same chain BuilderView's inline "Your games" panel uses (task, 2026-09-18: bring the
  // openingtree-style stats into Build mode too, without leaving two copies of this logic behind).
  const { tree, selectedGames, loadError } = useOwnGamesTree({ sources, color, filter });

  // The actual edges for the persisted `pathUcis`, rebuilt against the current tree every time
  // either changes — this is what truncates a saved path when the tree it was recorded against
  // (a fresh sync, a changed filter, a changed colour) no longer has one of its moves, and it's
  // also what makes the first real tree (once the async games load resolves, replacing the empty
  // placeholder tree the initial render used) pick the saved path back up instead of losing it.
  const path = useMemo(() => rebuildGamesPath(tree, pathUcis), [tree, pathUcis]);

  // A newly built tree (a sync landed, the filter or colour changed) can leave a stale
  // expandRequest (from a previous tree's Diagnostics "Show" click) targeting TreeMoves that no
  // longer exist — MoveTree reconciles its own expanded/showAll state on the same tree-changed
  // transition, so a leftover request here would have nothing valid left to apply it to. Same
  // "compare during render, reset if changed" trick v1 used, since an effect would let one
  // stale-tree render slip through first.
  const [treeForExpandRequest, setTreeForExpandRequest] = useState(tree);
  if (treeForExpandRequest !== tree) {
    setTreeForExpandRequest(tree);
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
    setPathUcis(pathToUcis(entryPath));
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
          {/* A plain Field, not a Panel: the aside is 24rem wide and every panel above the move
           * tree costs it rows, so the colour picker stays as compact as the Filters summary. */}
          <Field label="Colour">
            <SegmentedControl ariaLabel="Games tree colour" options={COLOR_OPTIONS} value={color} onChange={setColor} />
          </Field>
          <FilterBar filter={filter} onChange={setFilter} sources={sources} matched={tree.gamesFolded} total={selectedGames.length} skipped={tree.skipped} />
        </div>
      }
      footer={
        <Toolbar>
          <Button variant="quiet" onClick={() => setPathUcis([])} disabled={path.length === 0}>
            Back to start
          </Button>
          {/* Trims the resolved `path`, not the raw stored `pathUcis`: when the stored list is
           * longer than what currently resolves (a colour/filter change, a fresh sync), `path`
           * is already truncated and slicing the raw list would drop the wrong (still-valid)
           * entry, or no entry at all if `pathUcis` briefly out-ran `path` altogether. */}
          <Button variant="quiet" onClick={() => setPathUcis(pathToUcis(path).slice(0, -1))} disabled={path.length === 0}>
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
            <MoveTree tree={tree} path={path} onNavigate={p => setPathUcis(pathToUcis(p))} targetOpening={targetOpening} color={color} expandRequest={expandRequest} />
          </Panel>
          {lastEdge && (
            <Panel title="Games with this move">
              {lastEdge.lastPlayedAt && <p className="ob-tree-lastplayed">Last played {formatLastPlayed(lastEdge.lastPlayedAt)}</p>}
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
