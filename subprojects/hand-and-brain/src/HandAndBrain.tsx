import { useCallback, useState } from 'react';
import { Board } from '@human-chess/board';
import type { Role, SquareName } from '@human-chess/rules';
import {
  call, callableRoles, currentFen, describeEnd, handDests, isInCheck, lastMove, move, moveLines,
  sideToMove, startGame, type HandAndBrainGame,
} from './game';

// No CSS file exists yet for this subproject (the pattern other subprojects follow is a
// stylesheet owned by apps/web); kept inline and minimal here since this agent does not edit
// apps/web.
const styles = {
  root: { display: 'grid', gridTemplateColumns: 'minmax(0, 24rem) 16rem', gap: '1rem', padding: '1rem' },
  play: { maxWidth: '24rem' },
  status: { minHeight: '1.5em', fontWeight: 'bold' as const },
  calls: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, margin: '0.5rem 0' },
  callButton: { padding: '0.4rem 0.8rem', textTransform: 'capitalize' as const },
  actions: { marginTop: '0.5rem' },
  dialog: { border: '1px solid #8886', borderRadius: '0.5rem', padding: '1rem', margin: '0.5rem 0' },
  moves: { fontFamily: 'monospace' },
  moveLine: { margin: 0 },
};

const label = (color: string): string => color[0]!.toUpperCase() + color.slice(1);

export function HandAndBrain(): React.JSX.Element {
  const [game, setGame] = useState<HandAndBrainGame>(() => startGame());

  const onCall = (role: Role): void => setGame(g => call(g, role));
  const onMove = useCallback((from: SquareName, to: SquareName) => setGame(g => move(g, from, to)), []);

  const newGame = (): void => {
    if (!game.end && !window.confirm('Start a new game? This discards the current game.')) return;
    setGame(startGame());
  };

  const color = sideToMove(game);
  const dests = handDests(game);
  const calling = !game.end && game.calledRole === undefined;
  const moving = !game.end && game.calledRole !== undefined;

  const status = (): string => {
    if (game.end) return describeEnd(game);
    if (calling) return `${label(color)}'s brain: call a piece`;
    return `${label(color)}'s hand: move a ${game.calledRole}`;
  };

  return (
    <div style={styles.root}>
      <main style={styles.play}>
        <h3>Hand and Brain</h3>
        <Board
          fen={currentFen(game)}
          orientation="white"
          turnColor={color}
          dests={dests}
          movableColor={moving ? color : undefined}
          lastMove={lastMove(game)}
          check={isInCheck(game)}
          onMove={onMove}
        />
        <p style={styles.status} aria-live="polite">{status()}</p>

        {calling && (
          <div style={styles.calls}>
            {callableRoles(game).map(role => (
              <button key={role} style={styles.callButton} onClick={() => onCall(role)}>{role}</button>
            ))}
          </div>
        )}

        {game.end && (
          <div style={styles.dialog} role="dialog">
            <p>{describeEnd(game)}</p>
            <button onClick={newGame}>New game</button>
          </div>
        )}

        <div style={styles.actions}>
          <button onClick={newGame}>New game</button>
        </div>
      </main>

      <aside style={styles.moves}>
        <h4>Moves</h4>
        {moveLines(game).length === 0 ? (
          <p>No moves yet.</p>
        ) : (
          moveLines(game).map((line, i) => <p key={i} style={styles.moveLine}>{line}</p>)
        )}
      </aside>
    </div>
  );
}
