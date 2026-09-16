import { useEffect, useMemo, useState } from 'react';
import { Board } from '@human-chess/board';
import type { UciEngine } from '@human-chess/engine';
import { describeEnd, isInCheck, isPlayersTurn, lastMove, playerDests, result, sideToMove } from '@human-chess/play';
import { endgameLadder, type EndgameLesson } from '@human-chess/positions';
import { lessonOutcome } from './lessonAdapt';
import { loadConfident, saveConfident } from './progress';
import { useLessonGame } from './useLessonGame';

export interface EndgamesIntroProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

export function EndgamesIntro({ engine }: EndgamesIntroProps): React.JSX.Element {
  const [confident, setConfident] = useState<Set<string>>(() => loadConfident());
  const firstOpen = endgameLadder.find(l => !confident.has(l.id)) ?? endgameLadder[endgameLadder.length - 1]!;
  const [lesson, setLesson] = useState<EndgameLesson>(firstOpen);
  const [showIntro, setShowIntro] = useState(true);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const readyEngine = engine instanceof Error ? undefined : engine;
  const { game, engineState, onPlayerMove, restart, fen } = useLessonGame(lesson, readyEngine);

  useEffect(() => saveConfident(confident), [confident]);

  const index = endgameLadder.indexOf(lesson);
  const next = endgameLadder[index + 1];
  const outcome = lessonOutcome(result(game));
  const dests = useMemo(() => playerDests(game), [game]);

  const goTo = (l: EndgameLesson): void => {
    setLesson(l);
    setShowIntro(true);
    setConfirmSkip(false);
  };
  const markConfident = (): void => {
    setConfident(prev => new Set(prev).add(lesson.id));
    if (next) goTo(next);
  };

  const status = (): string => {
    if (engine instanceof Error) return `The engine could not be loaded: ${engine.message}`;
    if (!engine) return 'Loading the engine…';
    if (engineState.kind === 'failed') return `The engine failed: ${engineState.message}`;
    if (game.end) return describeEnd(game);
    if (engineState.kind === 'thinking') return 'Your opponent is thinking…';
    if (isPlayersTurn(game)) return isInCheck(game) ? 'You are in check. Your move.' : 'Your move.';
    return 'Waiting for your opponent.';
  };

  return (
    <div className="endgames">
      <aside className="endgames-lessons">
        <h2>Endgames first</h2>
        <ol>
          {endgameLadder.map(l => (
            <li key={l.id}>
              <button className={l.id === lesson.id ? 'current' : ''} onClick={() => goTo(l)}>
                {confident.has(l.id) ? '✓ ' : ''}{l.title}
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <main className="endgames-play">
        <h3>{lesson.title}</h3>
        <p className="endgames-colour">You play {game.playerColor}.</p>
        <Board
          fen={fen}
          orientation={game.playerColor}
          turnColor={sideToMove(game)}
          dests={dests}
          movableColor={isPlayersTurn(game) && readyEngine ? game.playerColor : undefined}
          lastMove={lastMove(game)}
          check={isInCheck(game)}
          onMove={onPlayerMove}
        />
        <p className="endgames-status" aria-live="polite">{status()}</p>

        {showIntro && (
          <div className="endgames-dialog" role="dialog">
            {lesson.introduces && <p className="endgames-newpiece">New piece: the {lesson.introduces}.</p>}
            <p>{lesson.intro}</p>
            <button onClick={() => setShowIntro(false)}>Let's go</button>
          </div>
        )}

        {!showIntro && outcome === 'won' && (
          <div className="endgames-dialog" role="dialog">
            <p>Do you think you can consistently always win this game or should we win one more time?</p>
            <button onClick={markConfident}>I'm Confident!</button>
            <button onClick={() => restart()}>Play Again</button>
          </div>
        )}

        {!showIntro && outcome === 'not-won' && (
          <div className="endgames-dialog" role="dialog">
            <p>{describeEnd(game)} Let's try that one again.</p>
            <button onClick={() => restart()}>Try again</button>
          </div>
        )}

        <div className="endgames-actions">
          {!game.end && <button onClick={() => restart()}>Restart this position</button>}
          {next && !confirmSkip && <button onClick={() => setConfirmSkip(true)}>Skip this lesson</button>}
          {next && confirmSkip && (
            <span>
              Are you sure? Later lessons assume this one.{' '}
              <button onClick={() => goTo(next)}>Yes, skip</button>
              <button onClick={() => setConfirmSkip(false)}>No</button>
            </span>
          )}
        </div>
      </main>
    </div>
  );
}
