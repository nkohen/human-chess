// "Where you lose most": the three read-only diagnostic views @human-chess/opening-tree's
// diagnostics.ts already computes over a GamesTree — worst moves (by score), most-lost
// positions (by loss count), and a per-opening rollup — plus a "Show" button per entry that
// reconstructs the entry's line back into a tree path (treeHelpers' pathFromSanLine) and hands
// it to the caller, which navigates the board and expands the move tree to it. Every number here
// is the tree's own recorded win/draw/loss count; nothing is computed or judged in this file
// (A1/V3).
import { useMemo, useState } from 'react';
import { childrenOf, mostLostPositions, openingSummary, worstMoves, type GamesTree, type TreeMove } from '@human-chess/opening-tree';
import { Button, Field, Panel } from '@human-chess/ui';
import { pathFromSanLine, wdlPercents, wdlTitle } from './treeHelpers';

export interface DiagnosticsProps {
  tree: GamesTree;
  minGames: number;
  onMinGamesChange: (minGames: number) => void;
  onShow: (path: TreeMove[]) => void;
}

const MIN_MIN_GAMES = 1;
const MAX_MIN_GAMES = 1000;
const LIMIT = 10;

function clamp(n: number): number {
  return Math.min(MAX_MIN_GAMES, Math.max(MIN_MIN_GAMES, Math.round(n)));
}

/** Rebuilds a full tree path (root first, `TreeMove[]`) from `line` (SAN, path TO `epd`, per
 * worstMoves'/mostLostPositions' own doc comments) via treeHelpers' `pathFromSanLine` — `entry.line`
 * alone is SAN text, not a path a board/move-tree can navigate to, so this is what turns a
 * diagnostics row back into something `onShow` can act on. `extra`, when given, is appended after
 * the reconstructed line (worstMoves' own `move`, so "Show" lands on the position *after* the bad
 * move, not just at the position it was played from) — that appending is specific to this file's
 * two callers, so it stays local rather than folding into the shared, unit-tested helper. */
function pathToEntry(tree: GamesTree, line: string[], extra?: TreeMove): TreeMove[] {
  const path = pathFromSanLine(tree.root, epd => childrenOf(tree, epd), line);
  return extra ? [...path, extra] : path;
}

export function Diagnostics({ tree, minGames, onMinGamesChange, onShow }: DiagnosticsProps): React.JSX.Element {
  const [minGamesText, setMinGamesText] = useState(String(minGames));

  const finalize = (raw: string): void => {
    const n = Number(raw);
    const clamped = Number.isFinite(n) ? clamp(n) : minGames;
    setMinGamesText(String(clamped));
    onMinGamesChange(clamped);
  };

  const worst = useMemo(() => worstMoves(tree, { minGames, limit: LIMIT }), [tree, minGames]);
  const mostLost = useMemo(() => mostLostPositions(tree, { minGames, limit: LIMIT }), [tree, minGames]);
  const openings = useMemo(() => openingSummary(tree).slice(0, LIMIT), [tree]);

  return (
    <Panel title="Where you lose most">
      <Field
        label="Minimum games"
        htmlFor="ob-diag-mingames"
        hint="Entries played fewer times than this are left out (first guess: 5)."
      >
        <input
          id="ob-diag-mingames"
          type="number"
          min={MIN_MIN_GAMES}
          max={MAX_MIN_GAMES}
          value={minGamesText}
          onChange={e => setMinGamesText(e.target.value)}
          onBlur={e => finalize(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') finalize(e.currentTarget.value);
          }}
        />
      </Field>

      <h4 className="ob-diag-subtitle">Your worst-scoring moves</h4>
      {worst.length === 0 ? (
        <p className="ob-diag-empty">No move has been played at least {minGames} times.</p>
      ) : (
        <div className="ob-diag-table-scroll">
        <table className="ob-diag-table">
          <thead>
            <tr>
              <th>Line</th>
              <th>Games</th>
              <th>Score</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {worst.map((entry, i) => {
              const pct = wdlPercents(entry.move.results);
              return (
                <tr key={i}>
                  <td>
                    {entry.line.join(' ')}
                    {entry.line.length > 0 ? ' ' : ''}
                    {entry.move.san}
                  </td>
                  <td>{entry.move.count}</td>
                  <td>
                    <span className="ob-tree-wdl" title={wdlTitle(pct, entry.move.count)}>
                      <span className="ob-tree-wdl-win" style={{ width: `${pct.win}%` }} />
                      <span className="ob-tree-wdl-draw" style={{ width: `${pct.draw}%` }} />
                      <span className="ob-tree-wdl-loss" style={{ width: `${pct.loss}%` }} />
                    </span>{' '}
                    {(entry.move.score * 100).toFixed(0)}%
                  </td>
                  <td>
                    <Button variant="quiet" size="sm" onClick={() => onShow(pathToEntry(tree, entry.line, entry.move))}>
                      Show
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      <h4 className="ob-diag-subtitle">Positions costing you the most losses</h4>
      {mostLost.length === 0 ? (
        <p className="ob-diag-empty">No position has been reached at least {minGames} times.</p>
      ) : (
        <div className="ob-diag-table-scroll">
        <table className="ob-diag-table">
          <thead>
            <tr>
              <th>Line</th>
              <th>Games</th>
              <th>Losses</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mostLost.map((entry, i) => (
              <tr key={i}>
                <td>{entry.line.length > 0 ? entry.line.join(' ') : '(start)'}</td>
                <td>{entry.node.games}</td>
                <td>
                  {entry.node.results.losses} ({((entry.node.results.losses / entry.node.games) * 100).toFixed(0)}%)
                </td>
                <td>
                  <Button variant="quiet" size="sm" onClick={() => onShow(pathToEntry(tree, entry.line))}>
                    Show
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <h4 className="ob-diag-subtitle">By opening</h4>
      {openings.length === 0 ? (
        <p className="ob-diag-empty">No folded game carries opening metadata.</p>
      ) : (
        <div className="ob-diag-table-scroll">
        <table className="ob-diag-table">
          <thead>
            <tr>
              <th>Opening</th>
              <th>Games</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {openings.map((row, i) => (
              <tr key={i}>
                <td>
                  {row.name}
                  {row.eco ? ` (${row.eco})` : ''}
                </td>
                <td>{row.games}</td>
                <td>{(row.score * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </Panel>
  );
}
