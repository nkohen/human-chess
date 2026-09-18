// Drilling: the user is oriented to the drilled colour; the app plays the other side's replies
// from the tree, picked uniformly at random when there are several (Math.random(), via
// drill.ts's `pickReply` — noted here per the task, since a weighted-by-real-opponents version
// is a later priority per memory/subprojects/openings-builder-trainer.md, "Training sessions").
// A move outside every selected opening's tree stops the drill rather than silently accepting
// or judging it with an engine (no engine in drill, per the task). No fabricated feedback: "not
// in your repertoire" is a structural fact about the tree, not a generated claim about the
// position (V3 is about engine/board-state claims; this is neither, it's a lookup).
//
// One opening or several: the union-of-graphs acceptance rule (memory/subprojects/
// openings-builder-trainer.md, "Deviation handling in drill mode"; drill.ts has the pure logic).
// A move wrong for one selected opening is accepted as long as some other selected opening still
// calls it right; the drill tracks which openings are still "live" and drops one silently (no
// stop) the moment the path leaves its graph — only a move absent from every live opening stops
// the drill.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import { inCheck, legalDests, playMove, positionFromFen, turn, uciSquares, type Role, type SquareName } from '@human-chess/rules';
import { Button, Panel, Status, Workbench } from '@human-chess/ui';
import { acceptedMoves, liveOpenings, nextMoveOptions, pickReply } from './drill';
import { fenAt, type Opening } from './repertoire';

export interface DrillViewProps {
  /** One opening, or several of the same colour for the multi-opening drill scope. The UI
   * (OpeningsBuilder's scope picker) enforces same-colour; nothing here re-checks it. */
  openings: Opening[];
  /** The opening picker / new-opening form / build-drill toggle, shared with BuilderView.
   * Rendered as `aside` here — drill's `primary` is the drill prompt itself. */
  controls: ReactNode;
  /** The engine-failed-to-load banner, if any; rendered as Workbench's `status`. Drilling never
   * calls the engine, but the banner is shown regardless of mode, same as before. */
  status?: ReactNode;
}

type DrillStatus = 'playing' | 'wrong' | 'complete';

const OPPONENT_MOVE_DELAY_MS = 400;

/** A stable key for the selected scope, so a `useState` initialiser can tell "same scope,
 * mid-drill, don't reset" apart from "the picker changed, reset". Order-sensitive on purpose:
 * OpeningsBuilder always passes the same order for a given scope. */
function scopeKey(openings: Opening[]): string {
  return openings.map(o => o.id).join(',');
}

export function DrillView({ openings, controls, status }: DrillViewProps): React.JSX.Element {
  const primary = openings[0];
  const color = primary?.color ?? 'white';
  const root = primary?.root ?? '';
  const [epd, setEpd] = useState(root);
  const [drillScopeKey, setDrillScopeKey] = useState(scopeKey(openings));
  const [trail, setTrail] = useState<string[]>([]);
  const [drillStatus, setDrillStatus] = useState<DrillStatus>('playing');
  const [expected, setExpected] = useState<{ san: string; openingNames: string[] }[]>([]);

  const reset = (): void => {
    setEpd(root);
    setTrail([]);
    setDrillStatus('playing');
    setExpected([]);
  };

  if (drillScopeKey !== scopeKey(openings)) {
    setDrillScopeKey(scopeKey(openings));
    reset();
  }

  // Keyed on the `openings` array itself (OpeningsBuilder memoises `drillOpenings`, so identity
  // only changes when the scope, the picked set, or an opening's contents change), so an edit or
  // rename that lands mid-drill is reflected at once rather than after the next move. The
  // opponent-move effect below depends on `live`, so that stability is what keeps its timer from
  // restarting on unrelated parent re-renders.
  const live = useMemo(() => liveOpenings(openings, trail), [openings, trail]);
  const pos = positionFromFen(epd);
  const usersTurn = turn(pos) === color;

  // Opponent replies: when it's the tree's other side to move, pick one of the live openings'
  // union of children uniformly at random and play it after a short pause. Empty options on
  // either side's turn means nothing further is recorded anywhere still live: the line is
  // complete.
  useEffect(() => {
    if (drillStatus !== 'playing') return;
    const options = nextMoveOptions(live, epd);
    if (options.length === 0) {
      setDrillStatus('complete');
      return;
    }
    if (usersTurn) return;
    const pick = pickReply(live, epd);
    if (!pick) return;
    const timer = setTimeout(() => {
      setTrail(t => [...t, pick.uci]);
      setEpd(pick.to);
    }, OPPONENT_MOVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, epd, drillStatus, usersTurn]);

  const onBoardMove = (from: SquareName, to: SquareName, promotion?: Role): void => {
    if (!usersTurn || drillStatus !== 'playing') return;
    const played = playMove(pos, from, to, promotion);
    const accepted = acceptedMoves(live, epd);
    const match = accepted.find(m => m.uci === played.uci);
    if (match) {
      setTrail(t => [...t, match.uci]);
      setEpd(match.to);
      return;
    }
    setExpected(accepted.map(m => ({ san: m.san, openingNames: m.openingNames })));
    setDrillStatus('wrong');
  };

  const dests = usersTurn && drillStatus === 'playing' ? legalDests(pos) : new Map<SquareName, SquareName[]>();
  const lastTrailUci = trail[trail.length - 1];
  const lastMove: [SquareName, SquareName] | undefined = lastTrailUci ? uciSquares(lastTrailUci) : undefined;

  // Single-opening scope keeps the exact wording the old one-opening drill used (plain SANs, no
  // "(opening name)" — there is only one, it would be noise); the annotation only earns its
  // place once several openings are in scope and a move's owner is actually informative.
  const expectedText =
    expected.length === 0
      ? '(nothing recorded here)'
      : openings.length <= 1
        ? expected.map(e => e.san).join(', ')
        : expected.map(e => `${e.san} (${e.openingNames.join(', ')})`).join(', ');

  const primaryBlock =
    drillStatus === 'wrong' ? (
      <div role="alert" className="ob-drill-result">
        <Status kind="error">Not in your repertoire. Expected: {expectedText}</Status>
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

  const title = openings.length <= 1 ? primary?.name ?? '' : openings.map(o => o.name).join(' + ');

  return (
    <Workbench
      title={title}
      status={status}
      primary={primaryBlock}
      aside={controls}
      board={sizePx => (
        <Board
          fen={fenAt(epd)}
          orientation={color}
          turnColor={turn(pos)}
          dests={dests}
          movableColor={usersTurn && drillStatus === 'playing' ? color : undefined}
          lastMove={lastMove}
          check={inCheck(pos)}
          onMove={onBoardMove}
          size={`${sizePx}px`}
        />
      )}
    >
      <Panel title="Moves so far">{trail.length === 0 ? <Status kind="info">(start)</Status> : <MoveLine startFen={fenAt(root)} ucis={trail} orientation={color} />}</Panel>
      {openings.length > 1 && (
        <p className="ob-drill-live">
          {drillStatus === 'complete'
            ? live.length > 0
              ? `Line complete, still matching: ${live.map(o => o.name).join(', ')}.`
              : 'Line complete.'
            : `Still in scope: ${live.length > 0 ? live.map(o => o.name).join(', ') : '(none)'}.`}
        </p>
      )}
    </Workbench>
  );
}
