// Drilling: the user is oriented to the opening's own colour; the app plays the other side's
// replies from the tree, picked uniformly at random when there are several (Math.random() below
// — noted here per the task, since a weighted-by-real-opponents version is a later priority per
// memory/subprojects/openings-builder-trainer.md, "Training sessions"). A move outside the tree
// stops the drill rather than silently accepting or judging it with an engine (no engine in
// drill, per the task). No fabricated feedback: "not in your repertoire" is a structural fact
// about the tree, not a generated claim about the position (V3 is about engine/board-state
// claims; this is neither, it's a lookup).
import { useEffect, useState, type ReactNode } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import { inCheck, isPromotionMove, legalDests, playMove, positionFromFen, turn, uciSquares, type SquareName } from '@human-chess/rules';
import { Button, Panel, Status, Workbench } from '@human-chess/ui';
import { childrenOf, fenAt, repertoireMoves, type Opening } from './repertoire';

export interface DrillViewProps {
  opening: Opening;
  /** The opening picker / new-opening form / build-drill toggle, shared with BuilderView.
   * Rendered as `aside` here — drill's `primary` is the drill prompt itself. */
  controls: ReactNode;
  /** The engine-failed-to-load banner, if any; rendered as Workbench's `status`. Drilling never
   * calls the engine, but the banner is shown regardless of mode, same as before. */
  status?: ReactNode;
}

type DrillStatus = 'playing' | 'wrong' | 'complete';

const OPPONENT_MOVE_DELAY_MS = 400;

export function DrillView({ opening, controls, status }: DrillViewProps): React.JSX.Element {
  const [epd, setEpd] = useState(opening.root);
  const [drillOpeningId, setDrillOpeningId] = useState(opening.id);
  const [trail, setTrail] = useState<string[]>([]);
  const [drillStatus, setDrillStatus] = useState<DrillStatus>('playing');
  const [expected, setExpected] = useState<string[]>([]);

  const reset = (): void => {
    setEpd(opening.root);
    setTrail([]);
    setDrillStatus('playing');
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
    if (drillStatus !== 'playing') return;
    const kids = childrenOf(opening, epd);
    if (kids.length === 0) {
      setDrillStatus('complete');
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
  }, [opening, epd, drillStatus, usersTurn]);

  const onBoardMove = (from: SquareName, to: SquareName): void => {
    if (!usersTurn || drillStatus !== 'playing') return;
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
    setDrillStatus('wrong');
  };

  const dests = usersTurn && drillStatus === 'playing' ? legalDests(pos) : new Map<SquareName, SquareName[]>();
  const lastTrailUci = trail[trail.length - 1];
  const lastMove: [SquareName, SquareName] | undefined = lastTrailUci ? uciSquares(lastTrailUci) : undefined;

  const primary =
    drillStatus === 'wrong' ? (
      <div role="alert" className="ob-drill-result">
        <Status kind="error">Not in your repertoire. Expected: {expected.length ? expected.join(', ') : '(nothing recorded here)'}</Status>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      </div>
    ) : drillStatus === 'complete' ? (
      <div role="status" className="ob-drill-result">
        <Status kind="success">Line complete.</Status>
        <Button variant="primary" onClick={reset}>
          Again
        </Button>
      </div>
    ) : (
      <Status kind={usersTurn ? 'info' : 'busy'}>{usersTurn ? 'Your move.' : "Opponent's move…"}</Status>
    );

  return (
    <Workbench
      title={opening.name}
      status={status}
      primary={primary}
      aside={controls}
      board={sizePx => (
        <Board
          fen={fenAt(epd)}
          orientation={opening.color}
          turnColor={turn(pos)}
          dests={dests}
          movableColor={usersTurn && drillStatus === 'playing' ? opening.color : undefined}
          lastMove={lastMove}
          check={inCheck(pos)}
          onMove={onBoardMove}
          size={`${sizePx}px`}
        />
      )}
    >
      <Panel title="Moves so far">{trail.length === 0 ? <Status kind="info">(start)</Status> : <MoveLine startFen={fenAt(opening.root)} ucis={trail} orientation={opening.color} />}</Panel>
    </Workbench>
  );
}
