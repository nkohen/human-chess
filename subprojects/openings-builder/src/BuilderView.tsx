// Interactive building: the user plays moves for both colours on the board (their own moves,
// and the opponent's "what if" replies they want in the tree — memory/subprojects/openings-builder-trainer.md,
// "Building a repertoire"). Every move played is added to the tree. The MultiPV panel on the
// right gives the multi-line engine the user's interview asked for (priority 1, same file).
import { useMemo, useState } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import type { UciEngine } from '@human-chess/engine';
import { inCheck, isPromotionMove, legalDests, playMove, positionFromFen, turn, type SquareName } from '@human-chess/rules';
import { ExplorerPanel } from './ExplorerPanel';
import { MultiPvPanel } from './MultiPvPanel';
import { addMove, childrenOf, fenAt, movesBeyond, removeMove, type Opening, type OpeningMove } from './repertoire';

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

  // Records several candidate opponent replies at once without moving along any of them; the
  // user then answers each from "Tree at this position".
  const children = childrenOf(opening, currentEpd);

  // A reply the rules library rejects (an explorer move that isn't legal here, say) is reported
  // and skipped, so it never takes the legal ones down with it (reviewer, 2026-09-16).
  const [replyError, setReplyError] = useState<string | undefined>(undefined);
  const addReplies = (ucis: string[]): void => {
    let updated = opening;
    const failed: string[] = [];
    for (const uci of ucis) {
      try {
        updated = addMove(updated, currentEpd, uci);
      } catch (err) {
        failed.push(`${uci} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    if (updated !== opening) onOpeningChange(updated);
    setReplyError(failed.length > 0 ? `Could not add: ${failed.join(', ')}` : undefined);
  };

  // Removing an edge whose continuation has recorded moves takes those with it (they become
  // unreachable), so that case asks first; a leaf goes without a prompt.
  const removeReply = (m: OpeningMove): void => {
    const beyond = movesBeyond(opening, m.to);
    if (beyond > 0 && !window.confirm(`Remove ${m.san} and the ${beyond} move${beyond === 1 ? '' : 's'} recorded after it?`)) return;
    onOpeningChange(removeMove(opening, currentEpd, m.uci));
  };

  const onBoardMove = (from: SquareName, to: SquareName): void => {
    const promotion = isPromotionMove(pos, from, to) ? 'queen' : undefined;
    const played = playMove(pos, from, to, promotion);
    playAndAdd(played.uci);
  };

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
        <div className="ob-children">
          <h4>Tree at this position</h4>
          {children.length === 0 && <p className="ob-multipv-status">No moves recorded here yet.</p>}
          <ul>
            {children.map(m => (
              <li key={m.uci}>
                <button onClick={() => setPath(p => [...p, m])}>{m.san}</button>
                <button
                  className="ob-remove"
                  title={`Remove ${m.san} from the tree`}
                  aria-label={`Remove ${m.san} from the tree`}
                  onClick={() => removeReply(m)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
        <MultiPvPanel
          engine={engine}
          fen={fen}
          onPlayMove={playAndAdd}
          orientation={opening.color}
          inTree={children.map(m => m.uci)}
          {...(turn(pos) !== opening.color ? { onAddReplies: addReplies } : {})}
        />
        {turn(pos) !== opening.color && <ExplorerPanel fen={fen} onAddMoves={addReplies} />}
        {replyError && <p className="ob-reply-error">{replyError}</p>}
      </div>
    </div>
  );
}
