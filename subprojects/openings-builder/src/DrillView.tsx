// Drilling: the user is oriented to the opening's own colour; the app plays the other side's
// replies from the tree, picked uniformly at random when there are several (Math.random() below
// — noted here per the task, since a weighted-by-real-opponents version is a later priority per
// memory/subprojects/openings-builder-trainer.md, "Training sessions"). A move outside the tree
// stops the drill rather than silently accepting or judging it with an engine (no engine in
// drill, per the task). No fabricated feedback: "not in your repertoire" is a structural fact
// about the tree, not a generated claim about the position (V3 is about engine/board-state
// claims; this is neither, it's a lookup).
import { useEffect, useState } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import { inCheck, isPromotionMove, legalDests, playMove, positionFromFen, turn, uciSquares, type SquareName } from '@human-chess/rules';
import { childrenOf, fenAt, repertoireMoves, type Opening } from './repertoire';

export interface DrillViewProps {
  opening: Opening;
}

type Status = 'playing' | 'wrong' | 'complete';

const OPPONENT_MOVE_DELAY_MS = 400;

export function DrillView({ opening }: DrillViewProps): React.JSX.Element {
  const [epd, setEpd] = useState(opening.root);
  const [drillOpeningId, setDrillOpeningId] = useState(opening.id);
  const [trail, setTrail] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('playing');
  const [expected, setExpected] = useState<string[]>([]);

  const reset = (): void => {
    setEpd(opening.root);
    setTrail([]);
    setStatus('playing');
    setExpected([]);
  };

  if (drillOpeningId !== opening.id) {
    setDrillOpeningId(opening.id);
    reset();
  }

  const pos = positionFromFen(epd);
  const usersTurn = turn(pos) === opening.color;

  // Opponent replies: when it's the tree's other side to move, pick one of the tree's children
  // uniformly at random with Math.random() and play it after a short pause. A node with no
  // children at all — on either side's turn — is a leaf: the line is complete.
  useEffect(() => {
    if (status !== 'playing') return;
    const kids = childrenOf(opening, epd);
    if (kids.length === 0) {
      setStatus('complete');
      return;
    }
    if (usersTurn) return;
    const pick = kids[Math.floor(Math.random() * kids.length)]!;
    const timer = setTimeout(() => {
      setTrail(t => [...t, pick.uci]);
      setEpd(pick.to);
    }, OPPONENT_MOVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening, epd, status, usersTurn]);

  const onBoardMove = (from: SquareName, to: SquareName): void => {
    if (!usersTurn || status !== 'playing') return;
    const promotion = isPromotionMove(pos, from, to) ? 'queen' : undefined;
    const played = playMove(pos, from, to, promotion);
    const own = repertoireMoves(opening, epd);
    const match = own.find(m => m.uci === played.uci);
    if (match) {
      setTrail(t => [...t, match.uci]);
      setEpd(match.to);
      return;
    }
    setExpected(own.map(m => m.san));
    setStatus('wrong');
  };

  const dests = usersTurn && status === 'playing' ? legalDests(pos) : new Map<SquareName, SquareName[]>();
  const lastTrailUci = trail[trail.length - 1];
  const lastMove: [SquareName, SquareName] | undefined = lastTrailUci ? uciSquares(lastTrailUci) : undefined;

  return (
    <div className="ob-drill">
      <div className="ob-board-col">
        <Board
          fen={fenAt(epd)}
          orientation={opening.color}
          turnColor={turn(pos)}
          dests={dests}
          movableColor={usersTurn && status === 'playing' ? opening.color : undefined}
          lastMove={lastMove}
          check={inCheck(pos)}
          onMove={onBoardMove}
        />
        {trail.length === 0 ? (
          <p className="ob-breadcrumb-line">(start)</p>
        ) : (
          <div className="ob-breadcrumb-line">
            <MoveLine startFen={fenAt(opening.root)} ucis={trail} orientation={opening.color} />
          </div>
        )}
      </div>

      <div className="ob-side-col">
        {status === 'playing' && <p className="ob-multipv-status">{usersTurn ? 'Your move.' : "Opponent's move…"}</p>}
        {status === 'wrong' && (
          <div className="ob-dialog" role="alert">
            <p>Not in your repertoire. Expected: {expected.length ? expected.join(', ') : '(nothing recorded here)'}</p>
            <button onClick={reset}>Try again</button>
          </div>
        )}
        {status === 'complete' && (
          <div className="ob-dialog" role="status">
            <p>Line complete.</p>
            <button onClick={reset}>Again</button>
          </div>
        )}
      </div>
    </div>
  );
}
