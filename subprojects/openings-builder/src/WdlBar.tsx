// The own-side win/draw/loss bar (green/grey/red, `.ob-tree-wdl*` — openings-builder.css), shared
// by MoveTree.tsx and BuilderView's "Your games" panel (OwnGamesPanel.tsx) so the same markup
// isn't hand-copied a second time. Own-side semantics throughout (the tracked player's own
// result), never White's/Black's literally — see treeHelpers' `wdlPercents`/`wdlTitle`, which
// this only renders.
import type { WDL } from '@human-chess/opening-tree';
import { cx } from '@human-chess/ui';
import { wdlPercents, wdlTitle } from './treeHelpers';

export interface WdlBarProps {
  results: WDL;
  /** The games count the bar's hover text cites — normally `results.wins + draws + losses`
   * (every real caller passes a `TreeMove`'s own `count`, which is exactly that sum), kept as its
   * own prop rather than re-derived so a caller never has to reconstruct it. */
  count: number;
  className?: string;
}

export function WdlBar({ results, count, className }: WdlBarProps): React.JSX.Element {
  const pct = wdlPercents(results);
  return (
    <span className={cx('ob-tree-wdl', className)} title={wdlTitle(pct, count)}>
      <span className="ob-tree-wdl-win" style={{ width: `${pct.win}%` }} />
      <span className="ob-tree-wdl-draw" style={{ width: `${pct.draw}%` }} />
      <span className="ob-tree-wdl-loss" style={{ width: `${pct.loss}%` }} />
    </span>
  );
}
