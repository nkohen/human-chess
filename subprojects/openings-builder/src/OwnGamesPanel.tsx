// BuilderView's "Your games" panel: openingtree-style statistics (own played-games tree,
// @human-chess/opening-tree) for the position currently on the board, shown right next to the
// engine lines and the lichess explorer while building a repertoire (task, 2026-09-18 — closes
// the gap between Build mode and the separate "Your games" mode, GamesTreeView.tsx). Every number
// here is read straight off the tree's own TreeNode/TreeMove via `rowsForPosition`
// (ownGamesTree.ts, A1/V3); this file only navigates and displays, same discipline as
// MoveTree.tsx/Diagnostics.tsx.
import type { GamesTree, TreeMove } from '@human-chess/opening-tree';
import { Button, Status } from '@human-chess/ui';
import { rowsForPosition } from './ownGamesTree';
import { formatLastPlayed } from './treeHelpers';
import { WdlBar } from './WdlBar';

export interface OwnGamesPanelProps {
  tree: GamesTree;
  /** The position on the board right now — same EPD convention (`repetitionKey`) as both
   * repertoire.ts and @human-chess/opening-tree, so this is looked up in `tree` directly, never
   * re-derived through a FEN round-trip. */
  epd: string;
  /** Whether it is the tracked player's own move at `epd`: every row is then a move the player
   * themselves played in their own games ("What you played here"); on the opponent's turn every
   * row is a reply an opponent played against them ("What opponents played here"). */
  turnIsOwn: boolean;
  /** The repertoire opening's own edges at this exact position (`childrenOf(opening, epd)`) — a
   * generic minimal shape so this file needs no dependency on repertoire.ts's `OpeningMove`. */
  repertoireChildren: ReadonlyArray<{ uci: string }>;
  /** Adds `move` to the repertoire at this position — BuilderView decides whether that's
   * `playAndAdd` (own turn, also navigates) or `addReplies([uci])` (opponent's turn). */
  onAdd: (move: TreeMove) => void;
  /** Navigates along `move`'s matching repertoire edge — only ever called for a row whose
   * `inTree` is true. */
  onGo: (move: TreeMove) => void;
  /** Whether any lichess/chess.com account is linked at all (BuilderView's own one-shot
   * `listSources()`), independent of whether that account's games have finished loading. */
  hasSources: boolean;
  /** True while sources or games are still being read from the store. */
  loading: boolean;
  loadError: string | undefined;
  /** The count `tree.gamesFolded` is "N of" — the games the current Your-games filter/source
   * selection matched before folding, i.e. `useOwnGamesTree`'s own `selectedGames.length`. */
  selectedGamesCount: number;
}

export function OwnGamesPanel({
  tree,
  epd,
  turnIsOwn,
  repertoireChildren,
  onAdd,
  onGo,
  hasSources,
  loading,
  loadError,
  selectedGamesCount,
}: OwnGamesPanelProps): React.JSX.Element {
  if (loadError) {
    return <Status kind="error">Couldn't load your synced games: {loadError}</Status>;
  }
  if (!hasSources) {
    return <Status kind="info">Link a lichess or chess.com account in Your games mode to see your own games here.</Status>;
  }
  if (loading) {
    return <Status kind="busy">Loading your games…</Status>;
  }

  const node = tree.nodes.get(epd);
  const games = node?.games ?? 0;
  const summary =
    games === 0
      ? 'None of your games reached this position.'
      : `${games} of your games reached this position · ${node!.results.wins}W ${node!.results.draws}D ${node!.results.losses}L`;
  const rows = rowsForPosition(tree, epd, repertoireChildren, turnIsOwn);

  return (
    <div className="ob-own-games">
      <p className="ob-own-games-summary">{summary}</p>
      <p className="ob-own-games-intent">{turnIsOwn ? 'What you played here' : 'What opponents played here'}</p>
      {rows.length === 0 ? (
        <Status kind="info">No moves recorded from your games at this position.</Status>
      ) : (
        <ul className="ob-own-games-rows">
          {rows.map(({ move, inTree, divergence }) => (
            <li key={move.uci} className="ob-own-games-row">
              <span className="ob-own-games-san">{move.san}</span>
              <span className="ob-own-games-count">{move.count}</span>
              <WdlBar results={move.results} count={move.count} />
              <span className="ob-own-games-score">{(move.score * 100).toFixed(0)}%</span>
              <span className="ob-own-games-lastplayed">{formatLastPlayed(move.lastPlayedAt)}</span>
              {divergence && <span className="ob-own-games-divergence">not in repertoire</span>}
              {inTree ? (
                <>
                  <span className="ob-own-games-check" title={`${move.san} is already in the repertoire`}>
                    ✓
                  </span>
                  <Button variant="quiet" size="sm" onClick={() => onGo(move)}>
                    Go
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => onAdd(move)}>
                  Add
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="ob-own-games-provenance">
        From {tree.gamesFolded} of your {selectedGamesCount} synced game{selectedGamesCount === 1 ? '' : 's'} (Your games filters apply).
      </p>
    </div>
  );
}
