// The player/preview screen: what a learner sees. A step's learner task is mutually exclusive
// (product decision, enforced in the editor via challenge.ts's withChallenge/withPlayOut):
//  - no task: a read-only board (with the author's saved annotations) plus prose.
//  - a one-move challenge: movable, and the played move is checked against `challenge.answers`
//    (never re-implemented — checkChallengeAnswer just does the membership check, and the move
//    itself only ever came from a legal destination Board offered).
//  - a play-out: the learner plays the whole position out against the engine, as the step's
//    `orientation` side, at the author's chosen difficulty — mirroring how the Endgames
//    subproject plays vs the engine (@human-chess/play's useEngineGame; see
//    subprojects/endgames-intro/src/EndgamesIntro.tsx and useLessonGame.ts). `playOut` takes
//    precedence over `challenge` when both are somehow present.
//
// `solved` is owned by the caller (LessonBuilder.tsx) and persisted per docs/design/2026-09-18-reload-survival.md,
// so a reload while sitting on an already-solved challenge step does not re-lock Next. Going to a
// different step always starts that step's challenge (if any) unsolved again — the honest
// behaviour for "the learner is looking at this step now", not a permanent per-lesson record.
// A play-out step's played moves are persisted the same way (`moves`, a UCI list) so a reload
// resumes the game in progress via useEngineGame's `initialMoves`; unlike a challenge, play-out
// is practice, not a gate — "Next" is never disabled by it (product decision).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UciEngine } from '@human-chess/engine';
import type { Lesson, LessonPlayOut, LessonStep } from '@human-chess/lessons';
import { Board } from '@human-chess/board';
import {
  describeEnd,
  isInCheck as gameInCheck,
  isPlayersTurn,
  lastMove as gameLastMove,
  limitedStrength,
  maximalResistance,
  playerDests,
  result,
  sideToMove,
  uciMoves,
} from '@human-chess/play';
import { useEngineGame } from '@human-chess/play/react';
import { fenOf, inCheck, legalDests, parseUciMove, playMove, positionFromFen, turn, uciSquares, type Role, type SquareName } from '@human-chess/rules';
import { Button, Panel, Status, Toolbar, Workbench, type StatusKind } from '@human-chess/ui';
import { checkChallengeAnswer } from './challenge';

export interface PlayerViewProps {
  lesson: Lesson;
  stepIndex: number;
  solved: boolean;
  onStepChange: (stepIndex: number, solved: boolean) => void;
  onBack: () => void;
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not
   * load. Only consulted for a step with a play-out. */
  engine: UciEngine | Error | undefined;
  /** UCI moves played so far in the current step's play-out game (docs/design/2026-09-18-reload-survival.md). */
  moves: string[];
  onMovesChange: (moves: string[]) => void;
}

export function PlayerView(props: PlayerViewProps): React.JSX.Element {
  const { lesson, stepIndex, solved, onStepChange, onBack, engine, moves, onMovesChange } = props;
  const step = lesson.steps[stepIndex];

  if (step?.playOut) {
    // Keyed by the step's id: navigating to a different step must start a fresh attempt (a
    // different position, possibly a different opponent), which is exactly what remounting gives
    // us for free — useEngineGame's internal game state is seeded once, at mount, from `moves`.
    return (
      <PlayOutPlayerView
        key={step.id}
        lesson={lesson}
        step={step as LessonStep & { playOut: LessonPlayOut }}
        stepIndex={stepIndex}
        onStepChange={onStepChange}
        onBack={onBack}
        engine={engine}
        moves={moves}
        onMovesChange={onMovesChange}
      />
    );
  }

  return <ChallengePlayerView lesson={lesson} stepIndex={stepIndex} solved={solved} onStepChange={onStepChange} onBack={onBack} />;
}

// --- no task / one-move challenge -------------------------------------------------------------

interface ChallengePlayerViewProps {
  lesson: Lesson;
  stepIndex: number;
  solved: boolean;
  onStepChange: (stepIndex: number, solved: boolean) => void;
  onBack: () => void;
}

function ChallengePlayerView({ lesson, stepIndex, solved, onStepChange, onBack }: ChallengePlayerViewProps): React.JSX.Element {
  const step = lesson.steps[stepIndex];

  // Transient "you just tried a move" feedback — not persisted (not user-facing progress once
  // the step itself is either solved or not; see the file header). Reset whenever the step
  // changes, via the same render-time identity-change pattern used elsewhere in this subproject.
  const [uiStepIndex, setUiStepIndex] = useState(stepIndex);
  const [attempt, setAttempt] = useState<{ uci: string; correct: boolean } | undefined>(undefined);
  if (uiStepIndex !== stepIndex) {
    setUiStepIndex(stepIndex);
    setAttempt(undefined);
  }

  const hasChallenge = step?.challenge !== undefined;
  const canAdvance = !hasChallenge || solved;

  const handleMove = (from: SquareName, to: SquareName, promotion?: Role): void => {
    if (!step?.challenge) return;
    const pos = positionFromFen(step.fen);
    const played = playMove(pos, from, to, promotion);
    const correct = checkChallengeAnswer(step.challenge, played.uci);
    setAttempt({ uci: played.uci, correct });
    if (correct) onStepChange(stepIndex, true);
  };

  const goNext = (): void => {
    if (!canAdvance || stepIndex >= lesson.steps.length - 1) return;
    onStepChange(stepIndex + 1, false);
  };
  const goBack = (): void => {
    if (stepIndex <= 0) return;
    onStepChange(stepIndex - 1, false);
  };

  const renderBoard = (sizePx: number): ReactNode => {
    if (!step) {
      return (
        <div className="lb-board-placeholder" style={{ width: sizePx, height: sizePx }}>
          <Status kind="info">This lesson has no steps yet.</Status>
        </div>
      );
    }
    // Recomputed fresh on every render (not memoised on the position) so a wrong-but-legal
    // attempt — which chessground has already moved the piece for, optimistically — is undone:
    // a changed `dests` reference makes Board's own update effect re-push `fen` (the position from
    // before the attempt), and chessground resets its pieces from that fen every time a `fen` is
    // present in the config it's given (packages/board's Board.tsx; chessground's own configure()
    // replaces `state.pieces` from `config.fen` unconditionally).
    //
    // Once the challenge is solved, show the position *after* the solving move (with it
    // highlighted) instead of snapping back to the pre-move position: prefer the move the learner
    // just played, and fall back to the first accepted answer after a reload (when the transient
    // `attempt` is gone). The saved annotations were drawn for the pre-move position, so they are
    // dropped on the solved board. Everything goes through the rules library (playMove/fenOf).
    const playable = hasChallenge && !solved;
    const solvingUci = hasChallenge && solved ? ((attempt?.correct ? attempt.uci : undefined) ?? step.challenge?.answers[0]) : undefined;
    let boardFen = step.fen;
    let lastMove: [SquareName, SquareName] | undefined;
    if (solvingUci) {
      try {
        const [from, to] = uciSquares(solvingUci);
        boardFen = fenOf(playMove(positionFromFen(step.fen), from, to, parseUciMove(solvingUci).promotion).pos);
        lastMove = [from, to];
      } catch {
        boardFen = step.fen; // a stored answer that no longer parses/plays: just show the position
      }
    }
    const pos = positionFromFen(boardFen);
    return (
      <Board
        fen={boardFen}
        orientation={step.orientation}
        turnColor={turn(pos)}
        dests={playable ? legalDests(pos) : new Map()}
        movableColor={playable ? turn(pos) : undefined}
        lastMove={lastMove}
        check={inCheck(pos)}
        onMove={handleMove}
        shapes={solvingUci ? [] : step.shapes}
        size={`${sizePx}px`}
      />
    );
  };

  return (
    <Workbench
      title={lesson.title || 'Untitled lesson'}
      status={
        step && lesson.steps.length > 0 ? (
          <span className="lb-player-step-count">
            Step {stepIndex + 1} of {lesson.steps.length}
          </span>
        ) : undefined
      }
      footer={
        <Toolbar>
          <Button variant="quiet" onClick={onBack}>
            Back to library
          </Button>
          <Button variant="quiet" onClick={goBack} disabled={stepIndex <= 0}>
            Back
          </Button>
          <Button onClick={goNext} disabled={!canAdvance || stepIndex >= lesson.steps.length - 1}>
            Next
          </Button>
        </Toolbar>
      }
      board={renderBoard}
    >
      {!step && <Status kind="info">This lesson has no steps yet — add some in the editor.</Status>}
      {step && (
        <Panel>
          {step.challenge?.prompt && <p className="lb-player-prompt">{step.challenge.prompt}</p>}
          <p className="lb-player-text">{step.text}</p>
          {hasChallenge && !solved && !attempt && <Status kind="info">Play the move to continue.</Status>}
          {hasChallenge && attempt && !attempt.correct && <Status kind="error">Not quite, try again.</Status>}
          {hasChallenge && solved && <Status kind="success">Correct!</Status>}
        </Panel>
      )}
    </Workbench>
  );
}

// --- play it out vs the engine ------------------------------------------------------------------

interface PlayOutPlayerViewProps {
  lesson: Lesson;
  step: LessonStep & { playOut: LessonPlayOut };
  stepIndex: number;
  onStepChange: (stepIndex: number, solved: boolean) => void;
  onBack: () => void;
  engine: UciEngine | Error | undefined;
  moves: string[];
  onMovesChange: (moves: string[]) => void;
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function PlayOutPlayerView({ lesson, step, stepIndex, onStepChange, onBack, engine, moves, onMovesChange }: PlayOutPlayerViewProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;

  // Module-scope-stable per step (id-keyed remount), so this never re-runs the auto-move effect
  // in useEngineGame with a fresh Opponent object on every render (see that hook's own comment on
  // why a stable reference matters).
  const opponent = useMemo(
    () => (step.playOut.strength.kind === 'max' ? maximalResistance() : limitedStrength(step.playOut.strength.elo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step.playOut.strength is read field-by-field so the memo doesn't churn on an equal-but-new object.
    [step.playOut.strength.kind, step.playOut.strength.kind === 'elo' ? step.playOut.strength.elo : undefined],
  );

  const { game, engineState, onPlayerMove, restart, fen, finished } = useEngineGame({
    startFen: step.fen,
    playerColor: step.orientation,
    engine: readyEngine,
    opponent,
    initialMoves: moves,
  });

  // Reload survival (docs/design/2026-09-18-reload-survival.md): keep the persisted move list in
  // sync with the game as it's played. `moves` above is only ever consumed once, by
  // useEngineGame's own state initialiser at mount (this component remounts, via its `key`, on
  // every step change) — this effect never feeds back into that initial value, so reacting to
  // `game` alone cannot loop.
  useEffect(() => {
    const current = uciMoves(game);
    if (!arraysEqual(current, moves)) onMovesChange(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally excludes `moves`/`onMovesChange`: see comment above.
  }, [game]);

  const dests = useMemo(() => (isPlayersTurn(game) && !finished ? playerDests(game) : new Map()), [game, finished]);

  const handleRestart = (): void => {
    restart();
    onMovesChange([]);
  };

  const goNext = (): void => {
    if (stepIndex >= lesson.steps.length - 1) return;
    onStepChange(stepIndex + 1, false);
  };
  const goBack = (): void => {
    if (stepIndex <= 0) return;
    onStepChange(stepIndex - 1, false);
  };

  // Never invents a result: `finished`/`result`/`describeEnd` all come straight from
  // @human-chess/play, which in turn only ever reports what the rules library computed (A1/V3).
  const outcome = result(game);
  const status = (): string => {
    if (engine instanceof Error) return `The engine could not be loaded: ${engine.message}`;
    if (!readyEngine) return 'Loading the engine…';
    if (engineState.kind === 'failed') return `The engine failed: ${engineState.message}`;
    if (finished) return game.end ? describeEnd(game) : 'This attempt has ended.';
    if (engineState.kind === 'thinking') return 'Your opponent is thinking…';
    return isPlayersTurn(game) ? (gameInCheck(game) ? 'You are in check. Your move.' : 'Your move.') : 'Waiting for your opponent.';
  };
  const statusKind: StatusKind =
    engine instanceof Error || engineState.kind === 'failed'
      ? 'error'
      : !readyEngine || engineState.kind === 'thinking'
        ? 'busy'
        : finished && outcome === 'won'
          ? 'success'
          : 'info';

  const renderBoard = (sizePx: number): ReactNode => (
    <Board
      fen={fen}
      orientation={step.orientation}
      turnColor={sideToMove(game)}
      dests={dests}
      movableColor={isPlayersTurn(game) && readyEngine && !finished ? game.playerColor : undefined}
      lastMove={gameLastMove(game)}
      check={gameInCheck(game)}
      onMove={onPlayerMove}
      size={`${sizePx}px`}
    />
  );

  return (
    <Workbench
      title={lesson.title || 'Untitled lesson'}
      status={
        <span className="lb-player-step-count">
          Step {stepIndex + 1} of {lesson.steps.length}
        </span>
      }
      footer={
        <Toolbar>
          <Button variant="quiet" onClick={onBack}>
            Back to library
          </Button>
          <Button variant="quiet" onClick={goBack} disabled={stepIndex <= 0}>
            Back
          </Button>
          {/* Play-out is practice, not a gate (product decision): Next is never disabled by it. */}
          <Button onClick={goNext} disabled={stepIndex >= lesson.steps.length - 1}>
            Next
          </Button>
        </Toolbar>
      }
      board={renderBoard}
    >
      <Panel>
        <p className="lb-player-colour">You play {step.orientation}.</p>
        <p className="lb-player-text">{step.text}</p>
        <Status kind={statusKind}>{status()}</Status>
        {finished && (
          <Toolbar>
            <Button onClick={handleRestart}>Restart</Button>
          </Toolbar>
        )}
      </Panel>
    </Workbench>
  );
}
