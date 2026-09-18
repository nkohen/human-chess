// Hot-seat Hand and Brain, humans only, one device, no engine, no clocks (memory/subprojects/
// hand-and-brain.md: "humans only for now"). Board screen, so it renders inside Workbench (board
// left, actions right, docs/design/2026-09-17-ui.md): the brain's piece-type call buttons are
// `primary` (the choice the side to move must make next), the move list is `children`, and
// "New game" is the `footer` Toolbar. AppShell renders the app's one `<main>`, so this component
// renders no `<main>`/`<h1>` of its own (adoption rule 8).
//
// There is no setup screen here: nothing in ./game assigns "who is hand"/"who is brain" per
// player or an engine side — both roles alternate automatically with the side to move, and there
// is no engine opponent in this variant yet. Adding either would be a behaviour change, out of
// scope for a design pass (docs/design/2026-09-17-ui.md, adoption rule 6).
import { useCallback, useEffect, useState } from 'react';
import { Board } from '@human-chess/board';
import type { Role, SquareName } from '@human-chess/rules';
import { Button, Panel, Status, Toolbar, usePersistedState, Workbench } from '@human-chess/ui';
import {
  call, callableRoles, currentFen, describeEnd, handDests, isInCheck, lastMove, move, moveLines,
  sideToMove, startGame, type HandAndBrainGame,
} from './game';
import { defaultScreen, replayGame, SCREEN_KEY, SCREEN_OPTIONS } from './screen';
import './hand-and-brain.css';

const label = (color: string): string => color[0]!.toUpperCase() + color.slice(1);

const sameUcis = (a: string[], b: string[]): boolean => a.length === b.length && a.every((u, i) => u === b[i]);

export function HandAndBrain(): React.JSX.Element {
  // The persisted snapshot (ucis + calledRole) is the source of truth across a reload; `game` is
  // rebuilt from it once at mount (replayGame throws on a corrupt/illegal snapshot, but
  // usePersistedState's `parse` already rejected anything replayGame would reject, so this
  // never half-restores a game — docs/design/2026-09-18-reload-survival.md).
  const [screen, setScreen] = usePersistedState(SCREEN_KEY, defaultScreen, SCREEN_OPTIONS);
  const [game, setGame] = useState<HandAndBrainGame>(() => replayGame(screen));

  // Mirrors `game` back into the persisted snapshot after every call/move. The equality check
  // keeps the mount-time render (whose `game` already matches `screen`) from writing storage
  // again — React bails out of a state update whose updater returns the same reference.
  useEffect(() => {
    const ucis = game.moves.map(m => m.uci);
    setScreen(s => (s.calledRole === game.calledRole && sameUcis(s.ucis, ucis) ? s : { ucis, calledRole: game.calledRole }));
  }, [game, setScreen]);

  // call()/move() throw on an invalid action (wrong phase, stale click after the state already
  // advanced, etc). A setState updater must stay pure and side-effect free, so an invalid action
  // is ignored here — the board just keeps its current state — rather than thrown from inside it.
  const onCall = (role: Role): void =>
    setGame(g => {
      try {
        return call(g, role);
      } catch {
        return g;
      }
    });
  const onMove = useCallback(
    (from: SquareName, to: SquareName, promotion?: Role) =>
      setGame(g => {
        try {
          return move(g, from, to, promotion);
        } catch {
          return g;
        }
      }),
    [],
  );

  const newGame = (): void => {
    if (!game.end && !window.confirm('Start a new game? This discards the current game.')) return;
    setGame(startGame());
  };

  const color = sideToMove(game);
  const dests = handDests(game);
  const calling = !game.end && game.calledRole === undefined;
  const moving = !game.end && game.calledRole !== undefined;
  const lines = moveLines(game);

  const status = (): string => {
    if (game.end) return describeEnd(game);
    if (calling) return `${label(color)}'s brain: call a piece`;
    return `${label(color)}'s hand: move a ${game.calledRole}`;
  };

  return (
    <Workbench
      title="Hand and Brain"
      status={<Status kind={game.end ? 'success' : 'info'}>{status()}</Status>}
      board={sizePx => (
        <Board
          fen={currentFen(game)}
          orientation="white"
          turnColor={color}
          dests={dests}
          movableColor={moving ? color : undefined}
          lastMove={lastMove(game)}
          check={isInCheck(game)}
          onMove={onMove}
          size={`${sizePx}px`}
        />
      )}
      primary={
        calling ? (
          <div className="hb-calls">
            {callableRoles(game).map(role => (
              <Button key={role} className="hb-call-button" onClick={() => onCall(role)}>
                {role}
              </Button>
            ))}
          </div>
        ) : undefined
      }
      footer={
        <Toolbar>
          <Button onClick={newGame}>New game</Button>
        </Toolbar>
      }
    >
      <Panel title="Moves">
        {lines.length === 0 ? <p className="hb-no-moves">No moves yet.</p> : lines.map((line, i) => <p key={i} className="hb-move-line">{line}</p>)}
      </Panel>
    </Workbench>
  );
}
