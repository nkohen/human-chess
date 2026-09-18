// The "Lines" mode (VisualizationTrainer.tsx's default, and the trainer's original shape): the
// learner sees a position and a short engine-chosen line (via @human-chess/board's MoveLine,
// notation-only until the reveal), answers questions about the end position without seeing it,
// then sees it. A session is ROUNDS exercises; the learner sees which exercise they are on and a
// running score, then a summary with a "play again" restart. Design record:
// memory/subprojects/visualization-trainer.md. The line and the end position are never
// invented — they come from a real engine call and @human-chess/rules board-state reads (A1);
// the questions themselves come from @human-chess/facts, never generated free-form (V3).
//
// Layout: docs/design/2026-09-17-ui.md. Board screen, so it renders inside Workbench (board
// left, actions right): the always-visible start board is the `board` slot, the line to
// visualize plus the three questions and their answer/check button are `primary` (the thing the
// learner must act on next), the round count and running score — and, once revealed, the end
// position — are `children`.
//
// Reload survival (docs/design/2026-09-18-reload-survival.md): every field of session progress
// lives in one snapshot object (snapshot.ts's LinesSnapshot), seeded synchronously in the
// usePersistedState initialiser. The engine-chosen line is only ever written into that snapshot
// once it is actually ready (`kind: 'ready'`) — 'loading'/'no-line'/'failed' are transient UI
// state (`transient` below), cheap to recompute, and so stay a plain `useState`, same reasoning
// as SoloRound.tsx's `error`. Loading a line for `startPosition` never happens twice: if a
// restored snapshot already has one for the current `startPosition`, the fetch effect below is
// skipped outright, so a reload's reveal shows exactly the line it showed before (A1).
import { useEffect, useMemo, useState } from 'react';
import { Board, MoveLine } from '@human-chess/board';
import type { UciEngine } from '@human-chess/engine';
import { endPosition, PIECE_ON_OPTIONS, questionsFor, type Position, type Question } from '@human-chess/facts';
import { fenOf, inCheck, positionFromFen, turn, uciSquares, type SquareName } from '@human-chess/rules';
import { Button, Field, navigateWithHandoff, SegmentedControl, Status, type StatusKind, usePersistedState, Workbench } from '@human-chess/ui';
import { LINE_PLIES, ROUNDS, randomStartPosition } from './exercise';
import { EMPTY_ANSWERS, freshLinesSnapshot, parseLinesSnapshot, VT_LINES_KEY, type AnswersSnapshot } from './snapshot';
import './visualization-trainer.css';

/** Search depth for the engine line the learner is asked to visualize. */
const ANALYSE_DEPTH = 10;

export interface LinesTrainerProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type ExerciseState =
  | { kind: 'loading' }
  | { kind: 'no-line' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; startFen: string; ucis: string[] };

type Answers = AnswersSnapshot;

const EMPTY_DESTS = new Map<SquareName, SquareName[]>();
const YES_NO_OPTIONS: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** An empty material answer is unanswered, not a guess of 0 — `Number('')` is 0 and would
 * otherwise silently count as correct whenever the true balance happens to be 0. */
const isMaterialCorrect = (value: string, answer: number): boolean => value !== '' && Number(value) === answer;

/** Formats a signed integer with an explicit sign, e.g. "+2", "0", "-3". */
const formatSigned = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

export function LinesTrainer({ engine }: LinesTrainerProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;
  const [snap, setSnap] = usePersistedState(VT_LINES_KEY, freshLinesSnapshot, { parse: parseLinesSnapshot });
  const { startPosition, exercise: storedExercise, answers, revealed, tally, round, sessionDone } = snap;
  const { fen: startFen, moves: startMoves } = startPosition;
  // True exactly when the persisted line is still the one for the position on screen — a stale
  // one (left over from before startPosition last changed) is treated the same as none at all.
  const hasStoredExercise = storedExercise !== undefined && storedExercise.startFen === startFen;
  const [transient, setTransient] = useState<{ kind: 'loading' } | { kind: 'no-line' } | { kind: 'failed'; message: string }>({ kind: 'loading' });
  const exercise: ExerciseState = useMemo(
    () => (hasStoredExercise ? { kind: 'ready', startFen: storedExercise!.startFen, ucis: storedExercise!.ucis } : transient),
    [hasStoredExercise, storedExercise, transient],
  );

  useEffect(() => {
    if (hasStoredExercise) return; // already have the real line for this position — never re-mine it
    setTransient({ kind: 'loading' });
    if (!readyEngine) return;
    let cancelled = false;
    readyEngine
      .analyse(startFen, [], { depth: ANALYSE_DEPTH })
      .then(analysis => {
        if (cancelled) return;
        const pv = analysis.lines[0]?.pv ?? [];
        if (pv.length === 0) {
          setTransient({ kind: 'no-line' });
          return;
        }
        const ucis = pv.slice(0, LINE_PLIES);
        setSnap(s => ({ ...s, exercise: { startFen, ucis } }));
      })
      .catch((err: unknown) => {
        if (!cancelled) setTransient({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
      readyEngine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyEngine, startFen, hasStoredExercise]);

  const startPos = useMemo(() => positionFromFen(startFen), [startFen]);
  // startMoves is the real setup-ply sequence that produced startFen (randomStartPosition); its
  // last entry is the move that reached this position, never invented (A1/V3).
  const startLastMove: [SquareName, SquareName] | undefined = useMemo(() => {
    const lastUci = startMoves[startMoves.length - 1];
    return lastUci ? uciSquares(lastUci) : undefined;
  }, [startMoves]);
  const end: Position | undefined = useMemo(
    () => (exercise.kind === 'ready' ? endPosition(exercise.startFen, exercise.ucis) : undefined),
    [exercise],
  );
  // The line's own last ply, so the end board's highlight is the real move that reached it,
  // never invented (A1/V3).
  const endLastMove: [SquareName, SquareName] | undefined = useMemo(() => {
    if (exercise.kind !== 'ready') return undefined;
    const lastUci = exercise.ucis[exercise.ucis.length - 1];
    return lastUci ? uciSquares(lastUci) : undefined;
  }, [exercise]);
  const questions: Question[] | undefined = useMemo(
    () => (exercise.kind === 'ready' ? questionsFor(exercise.startFen, exercise.ucis) : undefined),
    [exercise],
  );
  const [checkQ, pieceOnQ, materialQ] = questions ?? [];

  /** Fetches another line for the same round (used when the engine returned none — this never
   * happened as far as the learner is concerned, so it does not consume a round). */
  const retryExercise = (): void => setSnap(s => ({ ...s, startPosition: randomStartPosition(), exercise: undefined, answers: EMPTY_ANSWERS, revealed: false }));

  /** Advances to the next round, or — after the last one — ends the session. */
  const nextExercise = (): void => {
    if (round >= ROUNDS) {
      setSnap(s => ({ ...s, sessionDone: true }));
      return;
    }
    setSnap(s => ({ ...s, round: s.round + 1, startPosition: randomStartPosition(), exercise: undefined, answers: EMPTY_ANSWERS, revealed: false }));
  };

  const playAgain = (): void => {
    setSnap(s => ({
      ...s,
      tally: { correct: 0, total: 0 },
      round: 1,
      sessionDone: false,
      startPosition: randomStartPosition(),
      exercise: undefined,
      answers: EMPTY_ANSWERS,
      revealed: false,
    }));
  };

  const checkAnswers = (): void => {
    if (!questions) return;
    let correct = 0;
    if (checkQ?.kind === 'check' && answers.check === checkQ.answer) correct++;
    if (pieceOnQ?.kind === 'piece-on' && answers.pieceOn === pieceOnQ.answer) correct++;
    if (materialQ?.kind === 'material' && isMaterialCorrect(answers.material, materialQ.answer)) correct++;
    setSnap(s => ({ ...s, tally: { correct: s.tally.correct + correct, total: s.tally.total + questions.length }, revealed: true }));
  };

  const statusInfo = (): { kind: StatusKind; text: string } | undefined => {
    if (engine instanceof Error) return { kind: 'error', text: `The engine could not be loaded: ${engine.message}` };
    if (!engine) return { kind: 'busy', text: 'Loading the engine…' };
    if (exercise.kind === 'loading') return { kind: 'busy', text: 'The engine is choosing a line…' };
    if (exercise.kind === 'failed') return { kind: 'error', text: `The engine failed: ${exercise.message}` };
    return undefined;
  };
  const status = statusInfo();

  // Yes/No is a button-pair for one choice, so it is a SegmentedControl (adoption rule 4); the
  // control has no built-in disabled state, so the answer is simply locked (onChange ignored)
  // once revealed, and the CSS dims it to match (visualization-trainer.css).
  const checkValue = answers.check === true ? 'yes' : answers.check === false ? 'no' : '';

  return (
    <Workbench
      title="Visualization trainer"
      status={status && <Status kind={status.kind}>{status.text}</Status>}
      board={sizePx => (
        <Board
          fen={startFen}
          orientation="white"
          turnColor={turn(startPos)}
          dests={EMPTY_DESTS}
          movableColor={undefined}
          lastMove={startLastMove}
          check={inCheck(startPos)}
          onMove={() => undefined}
          size={`${sizePx}px`}
          // Drawing the line's arrows on the start board would do the visualizing for the learner.
          drawable={revealed}
        />
      )}
      primary={
        sessionDone ? (
          <div className="viz-summary">
            <p className="viz-summary-score">
              Session complete: {tally.correct} / {tally.total} correct
            </p>
            <Button variant="primary" onClick={playAgain}>
              Play again
            </Button>
            {/* The interview's secondary goal is blindfold chess; the bot-rating test hides its
                pieces when asked to (its blindfold=1 hand-off), so a whole game is one tap away. */}
            <Button variant="secondary" onClick={() => navigateWithHandoff('#/bot-rating', { blindfold: '1' })}>
              Play a blindfold game against the engine
            </Button>
          </div>
        ) : exercise.kind === 'no-line' ? (
          <div className="viz-dialog" role="dialog">
            <p>The engine returned no line.</p>
            <Button variant="primary" onClick={retryExercise}>
              Try another
            </Button>
          </div>
        ) : exercise.kind === 'ready' ? (
          <div className="viz-exercise">
            <div className="viz-line">
              Visualize this line: <MoveLine startFen={exercise.startFen} ucis={exercise.ucis} preview={revealed} />
            </div>

            <div className={`viz-question${revealed ? ' viz-question-locked' : ''}`}>
              <Field label={checkQ?.kind === 'check' ? checkQ.prompt : ''}>
                <SegmentedControl
                  ariaLabel={checkQ?.kind === 'check' ? checkQ.prompt : 'Is it check?'}
                  options={YES_NO_OPTIONS}
                  value={checkValue}
                  onChange={value => {
                    if (revealed) return;
                    setSnap(s => ({ ...s, answers: { ...s.answers, check: value === 'yes' } }));
                  }}
                />
              </Field>
              {revealed && checkQ?.kind === 'check' && (
                <span className={answers.check === checkQ.answer ? 'viz-correct' : 'viz-wrong'}>
                  {answers.check === checkQ.answer ? 'Correct' : `Wrong — it was ${checkQ.answer ? 'yes' : 'no'}`}
                </span>
              )}
            </div>

            <div className="viz-question">
              <Field label={pieceOnQ?.kind === 'piece-on' ? pieceOnQ.prompt : ''} htmlFor="viz-piece-on">
                <select
                  id="viz-piece-on"
                  disabled={revealed}
                  value={answers.pieceOn ?? ''}
                  onChange={e => setSnap(s => ({ ...s, answers: { ...s.answers, pieceOn: e.target.value } }))}
                >
                  <option value="" disabled>
                    choose…
                  </option>
                  {PIECE_ON_OPTIONS.map(o => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
              {revealed && pieceOnQ?.kind === 'piece-on' && (
                <span className={answers.pieceOn === pieceOnQ.answer ? 'viz-correct' : 'viz-wrong'}>
                  {answers.pieceOn === pieceOnQ.answer ? 'Correct' : `Wrong — it was ${pieceOnQ.answer}`}
                </span>
              )}
            </div>

            <div className="viz-question">
              {materialQ?.kind === 'material' && (
                <p className="viz-material-before">
                  Material now: White {materialQ.before.white}, Black {materialQ.before.black} (balance{' '}
                  {formatSigned(materialQ.before.balance)}).
                </p>
              )}
              <Field label={materialQ?.kind === 'material' ? materialQ.prompt : ''} htmlFor="viz-material">
                <input
                  id="viz-material"
                  type="number"
                  disabled={revealed}
                  value={answers.material}
                  onChange={e => setSnap(s => ({ ...s, answers: { ...s.answers, material: e.target.value } }))}
                />
              </Field>
              {revealed && materialQ?.kind === 'material' && (
                <span className={isMaterialCorrect(answers.material, materialQ.answer) ? 'viz-correct' : 'viz-wrong'}>
                  {isMaterialCorrect(answers.material, materialQ.answer) ? 'Correct' : `Wrong — it was ${formatSigned(materialQ.answer)}`}
                </span>
              )}
            </div>

            {!revealed && (
              <Button variant="primary" onClick={checkAnswers}>
                Check answers
              </Button>
            )}

            {revealed && (
              <Button variant="primary" onClick={nextExercise}>
                {round >= ROUNDS ? 'See results' : 'Next'}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {sessionDone ? null : (
        <div className="viz-progress">
          <p className="viz-round">
            Exercise {round} of {ROUNDS}
          </p>
          <p className="viz-tally">
            Score: {tally.correct} / {tally.total}
          </p>

          {revealed && end && (
            <div className="viz-end">
              <p>The end position:</p>
              <div className="viz-board-end">
                <Board
                  fen={fenOf(end)}
                  orientation="white"
                  turnColor={turn(end)}
                  dests={EMPTY_DESTS}
                  movableColor={undefined}
                  lastMove={endLastMove}
                  check={inCheck(end)}
                  onMove={() => undefined}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </Workbench>
  );
}
