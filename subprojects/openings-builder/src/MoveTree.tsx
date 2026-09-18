// The openingtree.com-style move tree: an expandable table over @human-chess/opening-tree's
// GamesTree, root first, each row's children rendered lazily (only once expanded — a whole
// multi-thousand-game tree is never fully in the DOM at once). Every number in a row (games,
// score, performance, last played) is read straight off the tree's own TreeMove (A1/V3) — this
// file only navigates and displays.
import { Fragment, useState } from 'react';
import { childrenOf, mostPlayed, type GamesTree, type GameRef, type TreeMove } from '@human-chess/opening-tree';
import type { Color } from '@human-chess/rules';
import { Button, usePersistedState } from '@human-chess/ui';
import { MOVE_TREE_EXPANDED_KEY, MOVE_TREE_SHOW_ALL_KEY, parseMoveTreeKeySet, reconcileMoveTreeKeys, serializeMoveTreeKeySet } from './persistence';
import { formatLastPlayed, pathKey, PERFORMANCE_TITLE, pathToUcis, wdlPercents, wdlTitle, type GamesTreeTarget } from './treeHelpers';

export type { GamesTreeTarget } from './treeHelpers';

/** Indentation is a CSS variable, not an inline padding, so yourGames.css can cap it (`min(...)`)
 * and shrink it on phones: a real opening line runs 10+ plies deep, and an unbounded per-level
 * indent overflowed the 24rem aside by depth 4 (measured 357px of content in a 350px column). */
function depthStyle(depth: number): React.CSSProperties {
  return { '--ob-depth': depth } as React.CSSProperties;
}

const CHILD_DISPLAY_CAP = 20;
const GAME_REF_DISPLAY_CAP = 20;

export interface MoveTreeProps {
  tree: GamesTree;
  /** The currently selected path, root first — drives which row is highlighted and what
   * `onNavigate` is called with (this node's path plus the clicked move). */
  path: TreeMove[];
  onNavigate: (path: TreeMove[]) => void;
  targetOpening?: GamesTreeTarget | undefined;
  color: Color;
  /** A one-shot request to expand every ancestor along `path` (and lift each of their `20`
   * display caps) so the deepest row is guaranteed to be in the DOM — Diagnostics' "Show"
   * buttons use this to jump straight to a worst-move/most-lost-position entry that may not be
   * among a node's most-played children. `token` must change on every request (even a repeat
   * click of the same entry) so the "did this request already run" check below can tell a fresh
   * request from one already applied. */
  expandRequest?: { path: TreeMove[]; token: number } | undefined;
}

interface RowsProps {
  tree: GamesTree;
  epd: string;
  path: TreeMove[];
  depth: number;
  selectedEpd: string;
  expanded: Set<string>;
  showAll: Set<string>;
  /** EPDs of every ancestor from the root down to (and including) `epd`, along *this* render
   * path — distinct from `expanded`/`showAll`, which are keyed by path string. A child move whose
   * `to` is already in `ancestors` would recurse into a subtree this render path has already
   * passed through (a genuine chess-position cycle, e.g. `1.Nf3 Nf6 2.Ng1 Ng8` returns to the
   * start position) — rendered as a terminal row with no expand control rather than followed,
   * since following it would recurse forever. */
  ancestors: Set<string>;
  toggleExpand: (key: string, navPath: TreeMove[]) => void;
  toggleShowAll: (key: string) => void;
  onNavigate: (path: TreeMove[]) => void;
  targetOpening: GamesTreeTarget | undefined;
  color: Color;
}

function MoveTreeRows({
  tree,
  epd,
  path,
  depth,
  selectedEpd,
  expanded,
  showAll,
  ancestors,
  toggleExpand,
  toggleShowAll,
  onNavigate,
  targetOpening,
  color,
}: RowsProps): React.JSX.Element {
  const children = mostPlayed(childrenOf(tree, epd));
  if (children.length === 0) return <></>;
  const nodeKey = pathKey(path);
  const cap = showAll.has(nodeKey) ? children.length : Math.min(children.length, CHILD_DISPLAY_CAP);
  const shown = children.slice(0, cap);

  return (
    <>
      {shown.map(move => {
        const childPath = [...path, move];
        const childKey = pathKey(childPath);
        // A cycle back to a position already on this render path (not merely a transposition
        // reached elsewhere in the tree) — never expandable, since expanding it would recurse
        // into the very subtree that produced it.
        const isCycle = ancestors.has(move.to);
        const isExpanded = !isCycle && expanded.has(childKey);
        const hasChildren = !isCycle && childrenOf(tree, move.to).length > 0;
        const node = tree.nodes.get(move.to);
        const isTransposition = !isCycle && (node?.parents ?? 0) > 1;
        const pct = wdlPercents(move.results);
        return (
          <Fragment key={`${epd}:${move.uci}`}>
            <tr
              className={move.to === selectedEpd ? 'ob-move-tree-row ob-move-tree-row--selected' : 'ob-move-tree-row'}
              title={move.lastPlayedAt ? `Last played ${formatLastPlayed(move.lastPlayedAt)}` : undefined}
            >
              <td>
                <div className="ob-move-tree-cell-move" style={depthStyle(depth)}>
                  {hasChildren ? (
                    <button
                      type="button"
                      className="ob-move-tree-expand"
                      aria-expanded={isExpanded}
                      aria-label={`Expand ${move.san}`}
                      onClick={() => toggleExpand(childKey, childPath)}
                    >
                      {isExpanded ? '▾' : '▸'}
                    </button>
                  ) : (
                    <span className="ob-move-tree-expand-spacer" />
                  )}
                  <button type="button" className="ob-move-tree-san" onClick={() => onNavigate(childPath)}>
                    {move.san}
                  </button>
                  {isCycle && (
                    <span className="ob-move-tree-transposition" title="repeats an earlier position">
                      ↩
                    </span>
                  )}
                  {isTransposition && (
                    <span className="ob-move-tree-transposition" title={`Reached by ${node!.parents} different move orders`}>
                      ↩
                    </span>
                  )}
                  {targetOpening && targetOpening.color === color && (
                    <Button variant="quiet" size="sm" onClick={() => targetOpening.addLine(pathToUcis(childPath))}>
                      Add to {targetOpening.name}
                    </Button>
                  )}
                </div>
              </td>
              <td>{move.count}</td>
              <td>
                <span className="ob-tree-wdl" title={wdlTitle(pct, move.count)}>
                  <span className="ob-tree-wdl-win" style={{ width: `${pct.win}%` }} />
                  <span className="ob-tree-wdl-draw" style={{ width: `${pct.draw}%` }} />
                  <span className="ob-tree-wdl-loss" style={{ width: `${pct.loss}%` }} />
                </span>{' '}
                {(move.score * 100).toFixed(0)}%
              </td>
              <td title={PERFORMANCE_TITLE}>{move.performance !== undefined ? Math.round(move.performance) : '—'}</td>
            </tr>
            {isExpanded && (
              <MoveTreeRows
                tree={tree}
                epd={move.to}
                path={childPath}
                depth={depth + 1}
                selectedEpd={selectedEpd}
                expanded={expanded}
                showAll={showAll}
                ancestors={new Set([...ancestors, move.to])}
                toggleExpand={toggleExpand}
                toggleShowAll={toggleShowAll}
                onNavigate={onNavigate}
                targetOpening={targetOpening}
                color={color}
              />
            )}
          </Fragment>
        );
      })}
      {children.length > cap && (
        <tr>
          <td className="ob-move-tree-showall" colSpan={4} style={depthStyle(depth + 1)}>
            <Button variant="quiet" size="sm" onClick={() => toggleShowAll(nodeKey)}>
              Show all {children.length}
            </Button>
          </td>
        </tr>
      )}
    </>
  );
}

/** The move tree table, root first. `expanded`/`showAll` are local UI state keyed by *path*
 * (`pathKey`, treeHelpers.ts) rather than by the EPD a path reaches — a position can recur along a
 * single render path (e.g. `1.Nf3 Nf6 2.Ng1 Ng8` cycles back to the start EPD), and an EPD-keyed
 * set would treat every occurrence of that EPD as already expanded, so `MoveTreeRows` would
 * recurse into the same subtree forever. `MoveTreeRows` additionally threads an `ancestors` set of
 * EPDs down the current render path so a cycle is caught structurally (rendered as a terminal row,
 * no expand control) even before any state is involved. Both are reset whenever `tree` itself
 * changes (a new fetch, a changed filter, a changed colour) since state built against a previous
 * tree means nothing for a new one — same "compare during render, reset if changed" trick
 * GamesTreeView already used for `path`. */
export function MoveTree({ tree, path, onNavigate, targetOpening, color, expandRequest }: MoveTreeProps): React.JSX.Element {
  const ROOT_KEY = '';
  const [expanded, setExpanded] = usePersistedState<Set<string>>(MOVE_TREE_EXPANDED_KEY, () => new Set([ROOT_KEY]), {
    parse: parseMoveTreeKeySet,
    serialize: serializeMoveTreeKeySet,
  });
  const [showAll, setShowAll] = usePersistedState<Set<string>>(MOVE_TREE_SHOW_ALL_KEY, () => new Set(), {
    parse: parseMoveTreeKeySet,
    serialize: serializeMoveTreeKeySet,
  });

  // A newly built tree (a fresh sync, a changed filter or colour — including the very first
  // "real" tree replacing the empty placeholder an async games load starts from) reconciles
  // rather than resets: each expanded/shown path is kept only if its uci sequence still resolves
  // against the new tree (reconcileMoveTreeKeys, same truncate-on-validity idea as a path
  // snapshot). A blind reset here would otherwise wipe a just-restored snapshot the instant the
  // real tree replaces that placeholder, before the user ever saw it. Reconciling is itself
  // skipped while `tree` has no root children at all: that's the transient empty placeholder
  // tree every mount starts from before the async games load resolves (or, briefly, a filter/sync
  // change in flight), and reconciling against it would read as "the real tree came back and
  // dropped every path" — wiping a just-restored snapshot the same way a blind reset would,
  // just one render later. Nothing renders from `expanded`/`showAll` while the tree is empty
  // anyway, so leaving them untouched here is free; the next tree with real content reconciles
  // them for real.
  const [treeForState, setTreeForState] = useState(tree);
  if (treeForState !== tree) {
    setTreeForState(tree);
    if (childrenOf(tree, tree.root).length > 0) {
      setExpanded(prev => reconcileMoveTreeKeys(tree, prev));
      setShowAll(prev => reconcileMoveTreeKeys(tree, prev));
    }
  }

  // Applies a Diagnostics "Show" request at most once per token — same "compare during render,
  // reset if changed" trick as the tree-change reset above, so a fresh request (even for the
  // exact same path/token value never seen before) always runs exactly once.
  const [appliedToken, setAppliedToken] = useState<number | undefined>(undefined);
  if (expandRequest && expandRequest.token !== appliedToken) {
    setAppliedToken(expandRequest.token);
    const keys = expandRequest.path.map((_, i) => pathKey(expandRequest.path.slice(0, i + 1)));
    setExpanded(prev => new Set([...prev, ROOT_KEY, ...keys]));
    setShowAll(prev => new Set([...prev, ROOT_KEY, ...keys]));
  }

  const selectedEpd = path.length > 0 ? path[path.length - 1]!.to : tree.root;

  const toggleExpand = (key: string, navPath: TreeMove[]): void => {
    const next = new Set(expanded);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      onNavigate(navPath);
    }
    setExpanded(next);
  };

  const toggleShowAll = (key: string): void => {
    const next = new Set(showAll);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setShowAll(next);
  };

  const rootExpanded = expanded.has(ROOT_KEY);
  const rootNode = tree.nodes.get(tree.root);

  return (
    <div className="ob-move-tree-scroll">
      <table className="ob-move-tree">
        <thead>
          <tr>
            <th>Move</th>
            <th>Games</th>
            <th>Score</th>
            {/* "Last played" is deliberately not a column: the Workbench aside is 24rem wide and
             * a fifth column clipped Perf. mid-word at every desktop width (coordinator, after the
             * code review's screenshots). It's shown for the selected move in GamesTreeView's
             * "Games with this move" panel instead, and as each row's tooltip. */}
            <th title={PERFORMANCE_TITLE}>Est. perf.</th>
          </tr>
        </thead>
        <tbody>
          <tr className={tree.root === selectedEpd ? 'ob-move-tree-row ob-move-tree-row--selected' : 'ob-move-tree-row'}>
            <td>
              <div className="ob-move-tree-cell-move">
                <button
                  type="button"
                  className="ob-move-tree-expand"
                  aria-expanded={rootExpanded}
                  aria-label="Expand root"
                  onClick={() => toggleExpand(ROOT_KEY, [])}
                >
                  {rootExpanded ? '▾' : '▸'}
                </button>
                <button type="button" className="ob-move-tree-san" onClick={() => onNavigate([])}>
                  root
                </button>
              </div>
            </td>
            <td>{rootNode?.games ?? 0}</td>
            <td>—</td>
            <td>—</td>
          </tr>
          {rootExpanded && (
            <MoveTreeRows
              tree={tree}
              epd={tree.root}
              path={[]}
              depth={1}
              selectedEpd={selectedEpd}
              expanded={expanded}
              showAll={showAll}
              ancestors={new Set([tree.root])}
              toggleExpand={toggleExpand}
              toggleShowAll={toggleShowAll}
              onNavigate={onNavigate}
              targetOpening={targetOpening}
              color={color}
            />
          )}
        </tbody>
      </table>
    </div>
  );
}

/** The games behind one edge, capped so a heavily-played move (hundreds of games) doesn't dump
 * an unbounded list — every entry is a real GameRef (url/playedAt/opponent straight off the
 * ImportedGame that contributed it), never summarised or invented. Ported unchanged from v1's
 * GamesTreeView. */
export function GameRefList({ refs }: { refs: GameRef[] }): React.JSX.Element {
  const shown = refs.slice(0, GAME_REF_DISPLAY_CAP);
  return (
    <ul className="ob-tree-gamerefs">
      {shown.map((ref, i) => (
        <li key={i}>
          {ref.url ? (
            <a href={ref.url} target="_blank" rel="noreferrer">
              {ref.opponent ?? 'game'}
            </a>
          ) : (
            (ref.opponent ?? 'game')
          )}
          {ref.playedAt ? ` — ${ref.playedAt.slice(0, 10)}` : ''}
        </li>
      ))}
      {refs.length > GAME_REF_DISPLAY_CAP && <li>+{refs.length - GAME_REF_DISPLAY_CAP} more</li>}
    </ul>
  );
}
