// The player/preview screen: what a learner sees. A step with no challenge is a read-only board
// (with the author's saved annotations) plus prose; a step with a challenge is movable and the
// played move is checked against `challenge.answers` (never re-implemented — checkChallengeAnswer
// just does the membership check, and the move itself only ever came from a legal destination
// Board offered).
//
// `solved` is owned by the caller (LessonBuilder.tsx) and persisted per docs/design/2026-09-18-reload-survival.md,
// so a reload while sitting on an already-solved challenge step does not re-lock Next. Going to a
// different step always starts that step's challenge (if any) unsolved again — the honest
// behaviour for "the learner is looking at this step now", not a permanent per-lesson record.
import { useState, type ReactNode } from 'react';
import type { Lesson } from '@human-chess/lessons';
import { Board } from '@human-chess/board';
import { fenOf, inCheck, legalDests, parseUciMove, playMove, positionFromFen, turn, uciSquares, type Role, type SquareName } from '@human-chess/rules';
import { Button, Panel, Status, Toolbar, Workbench } from '@human-chess/ui';
import { checkChallengeAnswer } from './challenge';

export interface PlayerViewProps {
  lesson: Lesson;
  stepIndex: number;
  solved: boolean;
  onStepChange: (stepIndex: number, solved: boolean) => void;
  onBack: () => void;
}

export function PlayerView({ lesson, stepIndex, solved, onStepChange, onBack }: PlayerViewProps): React.JSX.Element {
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
