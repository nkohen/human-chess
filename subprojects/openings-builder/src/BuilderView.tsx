// Interactive building: the user plays moves for both colours on the board (their own moves,
// and the opponent's "what if" replies they want in the tree — memory/subprojects/openings-builder-trainer.md,
// "Building a repertoire"). Every move played is added to the tree. The MultiPV panel on the
// right gives the multi-line engine the user's interview asked for (priority 1, same file).
import { useMemo, useState } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import type { UciEngine } from '@human-chess/engine';
import { inCheck, isPromotionMove, legalDests, playMove, positionFromFen, turn, type SquareName } from '@human-chess/rules';
import { MultiPvPanel } from './MultiPvPanel';
import { addMove, childrenOf, fenAt, type Opening, type OpeningMove } from './repertoire';

export interface BuilderViewProps {
  opening: Opening;
  onOpeningChange: (opening: Opening) => void;
  engine: UciEngine | undefined;
}

export function BuilderView({ opening, onOpeningChange, engine }: BuilderViewProps): React.JSX.Element {
  // The path of edges taken from the root to here. Re-derived to the empty path whenever the
  // selected opening changes (a different id means a different tree entirely).
  const [path, setPath] = useState<OpeningMove[]>([]);
  const [pathOpeningId, setPathOpeningId] = useState(opening.id);
  if (pathOpeningId !== opening.id) {
    setPathOpeningId(opening.id);
    setPath([]);
  }

  const currentEpd = path.length ? path[path.length - 1]!.to : opening.root;
  const fen = fenAt(currentEpd);
  const pos = useMemo(() => positionFromFen(fen), [fen]);
  const dests = useMemo(() => legalDests(pos), [pos]);

  const playAndAdd = (uci: string): void => {
    const updated = addMove(opening, currentEpd, uci);
    const edge = childrenOf(updated, currentEpd).find(m => m.uci === uci);
    onOpeningChange(updated);
    if (edge) setPath(p => [...p, edge]);
  };

  const onBoardMove = (from: SquareName, to: SquareName): void => {
    const promotion = isPromotionMove(pos, from, to) ? 'queen' : undefined;
    const played = playMove(pos, from, to, promotion);
    playAndAdd(played.uci);
  };

  const children = childrenOf(opening, currentEpd);

  return (
    <div className="ob-builder">
      <div className="ob-board-col">
        <Board
          fen={fen}
          orientation={opening.color}
          turnColor={turn(pos)}
          dests={dests}
          movableColor={turn(pos)}
          check={inCheck(pos)}
          onMove={onBoardMove}
        />
        <div className="ob-breadcrumb">
          <button onClick={() => setPath([])} disabled={path.length === 0}>
            Root
          </button>
          <button onClick={() => setPath(p => p.slice(0, -1))} disabled={path.length === 0}>
            Back
          </button>
          {path.length === 0 ? (
            <span className="ob-breadcrumb-line">(start)</span>
          ) : (
            <MoveLine startFen={fenAt(opening.root)} ucis={path.map(m => m.uci)} orientation={opening.color} />
          )}
        </div>
      </div>

      <div className="ob-side-col">
        <MultiPvPanel engine={engine} fen={fen} onPlayMove={playAndAdd} orientation={opening.color} />
        <div className="ob-children">
          <h4>Tree at this position</h4>
          {children.length === 0 && <p className="ob-multipv-status">No moves recorded here yet.</p>}
          <ul>
            {children.map(m => (
              <li key={m.uci}>
                <button onClick={() => setPath(p => [...p, m])}>{m.san}</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
