import { useEffect, useMemo, useState } from 'react';
import { Board } from '@human-chess/board';
import { formatScore, whitePerspective, type Analysis, type UciEngine } from '@human-chess/engine';
import { describeEnd, isInCheck, isPlayersTurn, lastMove, playerDests, result, sideToMove } from '@human-chess/play';
import { curatedEndgames, curatedGameDate, curatedOpponent, endgameLadder, EVAL_DEPTH, type CuratedPosition, type EndgameLesson } from '@human-chess/positions';
import { positionFromFen, turn } from '@human-chess/rules';
import { Button, Status, Toolbar, Workbench, type StatusKind } from '@human-chess/ui';
import { lessonOutcome } from './lessonAdapt';
import { loadConfident, saveConfident } from './progress';
import { useCuratedGame } from './useCuratedGame';
import { useLessonGame } from './useLessonGame';
import './endgames-intro.css';

export interface EndgamesIntroProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Mode = 'lesson' | 'curated';

export function EndgamesIntro({ engine }: EndgamesIntroProps): React.JSX.Element {
  const [confident, setConfident] = useState<Set<string>>(() => loadConfident());
  const firstOpen = endgameLadder.find(l => !confident.has(l.id)) ?? endgameLadder[endgameLadder.length - 1]!;
  const [lesson, setLesson] = useState<EndgameLesson>(firstOpen);
  const [mode, setMode] = useState<Mode>('lesson');
  const [curatedEntry, setCuratedEntry] = useState<CuratedPosition | undefined>(undefined);
  const [showIntro, setShowIntro] = useState(true);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const readyEngine = engine instanceof Error ? undefined : engine;

  // Only the active mode's hook is ever given a real engine — the inactive one gets `undefined`,
  // which is useEngineGame's own signal not to run its auto-move effect, so switching modes never
  // leaves a background game quietly playing itself out against the shared engine.
  const { game, engineState, onPlayerMove, restart, fen } = useLessonGame(lesson, mode === 'lesson' ? readyEngine : undefined);
  const {
    game: curatedGame,
    engineState: curatedEngineState,
    onPlayerMove: onCuratedMove,
    restart: restartCurated,
    fen: curatedFen,
  } = useCuratedGame(curatedEntry, mode === 'curated' ? readyEngine : undefined);

  useEffect(() => saveConfident(confident), [confident]);

  const index = endgameLadder.indexOf(lesson);
  const next = endgameLadder[index + 1];
  const outcome = lessonOutcome(result(game));
  const dests = useMemo(() => playerDests(game), [game]);
  const curatedDests = useMemo(() => playerDests(curatedGame), [curatedGame]);

  // The engine's read of the curated position exactly as first chosen (A1): one real analyse
  // call per selection, not repeated on every "Play again" of the same position, and not
  // silently skipped if it fails.
  const [startingEval, setStartingEval] = useState<Analysis | undefined>(undefined);
  const [startingEvalError, setStartingEvalError] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (mode !== 'curated' || !curatedEntry || !readyEngine) return;
    let cancelled = false;
    setStartingEval(undefined);
    setStartingEvalError(undefined);
    readyEngine
      .analyse(curatedEntry.fen, [], { depth: EVAL_DEPTH })
      .then(a => {
        if (cancelled) return;
        if (!a.lines[0]) {
          setStartingEvalError(`${a.engine} returned no evaluation line for this position`);
          return;
        }
        setStartingEval(a);
      })
      .catch((err: unknown) => {
        if (!cancelled) setStartingEvalError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      readyEngine.stop();
    };
  }, [mode, curatedEntry, readyEngine]);

  const goTo = (l: EndgameLesson): void => {
    setMode('lesson');
    setLesson(l);
    setShowIntro(true);
    setConfirmSkip(false);
  };
  const markConfident = (): void => {
    setConfident(prev => new Set(prev).add(lesson.id));
    if (next) goTo(next);
  };
  // progress.ts only ever recorded "confident" lesson ids from the ladder's win/confidence
  // prompt; a curated real-game position gets no such prompt (see the render below — we do not
  // claim which side "should" win a real game), so there is nothing analogous to record here.
  // Per the task: progress.ts records nothing for curated positions.
  const selectCurated = (entry: CuratedPosition): void => {
    setMode('curated');
    setCuratedEntry(entry);
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

  const curatedStatus = (): string => {
    if (engine instanceof Error) return `The engine could not be loaded: ${engine.message}`;
    if (!engine) return 'Loading the engine…';
    if (curatedEngineState.kind === 'failed') return `The engine failed: ${curatedEngineState.message}`;
    if (curatedGame.end) return describeEnd(curatedGame);
    if (curatedEngineState.kind === 'thinking') return 'Your opponent is thinking…';
    if (isPlayersTurn(curatedGame)) return isInCheck(curatedGame) ? 'You are in check. Your move.' : 'Your move.';
    return 'Waiting for your opponent.';
  };

  // Status kind is presentational only (icon/colour) — never changes the text a claim carries.
  // Curated real-game positions never claim a "success" (we don't say which side should win a
  // real game, per the comment on selectCurated above), so that one stays 'info' even at the end.
  const lessonStatusKind: StatusKind =
    engine instanceof Error || engineState.kind === 'failed'
      ? 'error'
      : !engine || engineState.kind === 'thinking'
        ? 'busy'
        : game.end && outcome === 'won'
          ? 'success'
          : 'info';

  const curatedStatusKind: StatusKind =
    engine instanceof Error || curatedEngineState.kind === 'failed'
      ? 'error'
      : !engine || curatedEngineState.kind === 'thinking'
        ? 'busy'
        : 'info';

  const startingEvalLine = ((): string => {
    if (!curatedEntry) return '';
    const line = startingEval?.lines[0];
    if (line) {
      const score = whitePerspective(line.score, turn(positionFromFen(curatedEntry.fen)));
      return `Starting position: ${formatScore(score)} (${startingEval!.engine}, depth ${line.depth}).`;
    }
    if (startingEvalError) return `Could not evaluate the starting position: ${startingEvalError}`;
    return 'Evaluating the starting position…';
  })();

  const inCurated = mode === 'curated' && curatedEntry !== undefined;

  const title = inCurated ? `vs ${curatedOpponent(curatedEntry!.game) ?? 'unknown opponent'}` : lesson.title;

  const statusContent = inCurated ? (
    <>
      <p className="endgames-provenance">
        From your game on {curatedEntry!.game.site === 'chess.com' ? 'chess.com' : 'lichess'}
        {curatedGameDate(curatedEntry!.game) ? ` (${curatedGameDate(curatedEntry!.game)})` : ''}.
        {curatedEntry!.source === 'screenshot-transcription' && ' (transcribed from a screenshot — a piece could be off.)'}
        {curatedEntry!.game.url && (
          <>
            {' '}
            <a href={curatedEntry!.game.url} target="_blank" rel="noreferrer">
              view game
            </a>
          </>
        )}
      </p>
      <p className="endgames-colour">You play {curatedEntry!.playAs}.</p>
      <Status kind={curatedStatusKind}>{curatedStatus()}</Status>
    </>
  ) : (
    <>
      <p className="endgames-colour">You play {game.playerColor}.</p>
      <Status kind={lessonStatusKind}>{status()}</Status>
    </>
  );

  const primaryContent = inCurated
    ? curatedGame.end
      ? (
          <div className="endgames-dialog" role="dialog">
            {/* A real position from a real game, not a won-endgame lesson: state how it ended
                (from rules, via describeEnd) without claiming which side "should" have won. */}
            <p>{describeEnd(curatedGame)}</p>
            <p className="endgames-starting-eval">{startingEvalLine}</p>
            <Button variant="primary" onClick={() => restartCurated()}>
              Play again
            </Button>
          </div>
        )
      : undefined
    : showIntro
      ? (
          <div className="endgames-dialog" role="dialog">
            {lesson.introduces && <p className="endgames-newpiece">New piece: the {lesson.introduces}.</p>}
            <p>{lesson.intro}</p>
            <Button variant="primary" onClick={() => setShowIntro(false)}>
              Let&apos;s go
            </Button>
          </div>
        )
      : outcome === 'won'
        ? (
            <div className="endgames-dialog" role="dialog">
              <p>Do you think you can consistently always win this game or should we win one more time?</p>
              <Button variant="primary" onClick={markConfident}>
                I&apos;m Confident!
              </Button>
              <Button onClick={() => restart()}>Play Again</Button>
            </div>
          )
        : outcome === 'not-won'
          ? (
              <div className="endgames-dialog" role="dialog">
                <p>{describeEnd(game)} Let&apos;s try that one again.</p>
                <Button variant="primary" onClick={() => restart()}>
                  Try again
                </Button>
              </div>
            )
          : undefined;

  const footerContent = inCurated ? (
    !curatedGame.end ? (
      <Toolbar>
        <Button onClick={() => restartCurated()}>Restart this position</Button>
      </Toolbar>
    ) : undefined
  ) : (
    <Toolbar>
      {!game.end && <Button onClick={() => restart()}>Restart this position</Button>}
      {next && !confirmSkip && <Button onClick={() => setConfirmSkip(true)}>Skip this lesson</Button>}
      {next && confirmSkip && (
        <>
          <span>Are you sure? Later lessons assume this one.</span>
          <Button onClick={() => goTo(next)}>Yes, skip</Button>
          <Button onClick={() => setConfirmSkip(false)}>No</Button>
        </>
      )}
    </Toolbar>
  );

  return (
    <Workbench
      title={title}
      status={statusContent}
      primary={primaryContent}
      footer={footerContent}
      board={sizePx =>
        inCurated ? (
          <Board
            fen={curatedFen}
            orientation={curatedEntry!.playAs}
            turnColor={sideToMove(curatedGame)}
            dests={curatedDests}
            movableColor={isPlayersTurn(curatedGame) && readyEngine ? curatedGame.playerColor : undefined}
            lastMove={lastMove(curatedGame)}
            check={isInCheck(curatedGame)}
            onMove={onCuratedMove}
            size={`${sizePx}px`}
          />
        ) : (
          <Board
            fen={fen}
            orientation={game.playerColor}
            turnColor={sideToMove(game)}
            dests={dests}
            movableColor={isPlayersTurn(game) && readyEngine ? game.playerColor : undefined}
            lastMove={lastMove(game)}
            check={isInCheck(game)}
            onMove={onPlayerMove}
            size={`${sizePx}px`}
          />
        )
      }
    >
      <h3 className="endgames-section-title">Lessons</h3>
      <ol className="endgames-lesson-list">
        {endgameLadder.map(l => (
          <li key={l.id}>
            <Button
              variant="quiet"
              className={mode === 'lesson' && l.id === lesson.id ? 'endgames-current' : ''}
              onClick={() => goTo(l)}
            >
              {confident.has(l.id) ? '✓ ' : ''}
              {l.title}
            </Button>
          </li>
        ))}
      </ol>

      <h3 className="endgames-section-title">From your games</h3>
      <ol className="endgames-curated-list">
        {curatedEndgames.map(e => (
          <li key={e.id}>
            <Button
              variant="quiet"
              className={mode === 'curated' && curatedEntry?.id === e.id ? 'endgames-current' : ''}
              title={e.note}
              onClick={() => selectCurated(e)}
            >
              vs {curatedOpponent(e.game) ?? 'unknown opponent'} ({e.game.site === 'chess.com' ? 'chess.com' : 'lichess'}),{' '}
              {curatedGameDate(e.game) ?? 'date unknown'} — you play {e.playAs}
              {e.source === 'screenshot-transcription' && <span className="endgames-transcribed-hint"> (transcribed from a screenshot)</span>}
            </Button>
          </li>
        ))}
      </ol>
    </Workbench>
  );
}
