// Visualization trainer: the learner sees a position and a short engine-chosen line in SAN,
// answers questions about the end position without seeing it, then sees it. Design record:
// memory/subprojects/visualization-trainer.md. This is the minimal slice: a fixed random start
// position, a fixed-depth engine line, and three facts-package questions (V3). The line and the
// end position are never invented — they come from a real engine call and @human-chess/rules
// board-state reads (A1).
import { useEffect, useMemo, useState } from 'react';
import { Board } from '@human-chess/board';
import type { UciEngine } from '@human-chess/engine';
import { endPosition, PIECE_ON_OPTIONS, questionsFor, type Position, type Question } from '@human-chess/facts';
import { fenOf, inCheck, positionFromFen, turn, type SquareName } from '@human-chess/rules';
import { formatLine, lineSans, LINE_PLIES, randomStartFen } from './exercise';
import './visualization-trainer.css';

/** Search depth for the engine line the learner is asked to visualize. */
const ANALYSE_DEPTH = 10;

export interface VisualizationTrainerProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type ExerciseState =
  | { kind: 'loading' }
  | { kind: 'no-line' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; startFen: string; ucis: string[]; sans: string[] };

type Answers = { check: boolean | undefined; pieceOn: string | undefined; material: string };

const EMPTY_ANSWERS: Answers = { check: undefined, pieceOn: undefined, material: '' };
const EMPTY_DESTS = new Map<SquareName, SquareName[]>();

/** An empty material answer is unanswered, not a guess of 0 — `Number('')` is 0 and would
 * otherwise silently count as correct whenever the true balance happens to be 0. */
const isMaterialCorrect = (value: string, answer: number): boolean => value !== '' && Number(value) === answer;

export function VisualizationTrainer({ engine }: VisualizationTrainerProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;
  const [startFen, setStartFen] = useState(() => randomStartFen());
  const [exercise, setExercise] = useState<ExerciseState>({ kind: 'loading' });
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    setExercise({ kind: 'loading' });
    setAnswers(EMPTY_ANSWERS);
    setRevealed(false);
    if (!readyEngine) return;
    let cancelled = false;
    readyEngine
      .analyse(startFen, [], { depth: ANALYSE_DEPTH })
      .then(analysis => {
        if (cancelled) return;
        const pv = analysis.lines[0]?.pv ?? [];
        if (pv.length === 0) {
          setExercise({ kind: 'no-line' });
          return;
        }
        const ucis = pv.slice(0, LINE_PLIES);
        setExercise({ kind: 'ready', startFen, ucis, sans: lineSans(startFen, ucis) });
      })
      .catch((err: unknown) => {
        if (!cancelled) setExercise({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
      readyEngine.stop();
    };
  }, [readyEngine, startFen]);

  const startPos = useMemo(() => positionFromFen(startFen), [startFen]);
  const end: Position | undefined = useMemo(
    () => (exercise.kind === 'ready' ? endPosition(exercise.startFen, exercise.ucis) : undefined),
    [exercise],
  );
  const questions: Question[] | undefined = useMemo(() => (end ? questionsFor(end) : undefined), [end]);
  const [checkQ, pieceOnQ, materialQ] = questions ?? [];

  const nextExercise = (): void => setStartFen(randomStartFen());

  const checkAnswers = (): void => {
    if (!questions) return;
    let correct = 0;
    if (checkQ?.kind === 'check' && answers.check === checkQ.answer) correct++;
    if (pieceOnQ?.kind === 'piece-on' && answers.pieceOn === pieceOnQ.answer) correct++;
    if (materialQ?.kind === 'material' && isMaterialCorrect(answers.material, materialQ.answer)) correct++;
    setTally(t => ({ correct: t.correct + correct, total: t.total + questions.length }));
    setRevealed(true);
  };

  const status = (): string | undefined => {
    if (engine instanceof Error) return `The engine could not be loaded: ${engine.message}`;
    if (!engine) return 'Loading the engine…';
    if (exercise.kind === 'loading') return 'The engine is choosing a line…';
    if (exercise.kind === 'failed') return `The engine failed: ${exercise.message}`;
    return undefined;
  };

  const statusText = status();

  return (
    <div className="viz">
      <h2>Visualization trainer</h2>
      <p className="viz-tally">
        Score: {tally.correct} / {tally.total}
      </p>

      <div className="viz-board">
        <Board
          fen={startFen}
          orientation="white"
          turnColor={turn(startPos)}
          dests={EMPTY_DESTS}
          movableColor={undefined}
          check={inCheck(startPos)}
          onMove={() => undefined}
        />
      </div>

      {statusText && (
        <p className="viz-status" aria-live="polite">
          {statusText}
        </p>
      )}

      {exercise.kind === 'no-line' && (
        <div className="viz-dialog" role="dialog">
          <p>The engine returned no line.</p>
          <button onClick={nextExercise}>Try another</button>
        </div>
      )}

      {exercise.kind === 'ready' && (
        <div className="viz-exercise">
          <p className="viz-line">Visualize this line: {formatLine(exercise.startFen, exercise.sans)}</p>

          <div className="viz-question">
            <p>{checkQ?.kind === 'check' ? checkQ.prompt : ''}</p>
            <button
              className={answers.check === true ? 'selected' : ''}
              disabled={revealed}
              onClick={() => setAnswers(a => ({ ...a, check: true }))}
            >
              Yes
            </button>
            <button
              className={answers.check === false ? 'selected' : ''}
              disabled={revealed}
              onClick={() => setAnswers(a => ({ ...a, check: false }))}
            >
              No
            </button>
            {revealed && checkQ?.kind === 'check' && (
              <span className={answers.check === checkQ.answer ? 'viz-correct' : 'viz-wrong'}>
                {answers.check === checkQ.answer ? 'Correct' : `Wrong — it was ${checkQ.answer ? 'yes' : 'no'}`}
              </span>
            )}
          </div>

          <div className="viz-question">
            <p>{pieceOnQ?.kind === 'piece-on' ? pieceOnQ.prompt : ''}</p>
            <select disabled={revealed} value={answers.pieceOn ?? ''} onChange={e => setAnswers(a => ({ ...a, pieceOn: e.target.value }))}>
              <option value="" disabled>
                choose…
              </option>
              {PIECE_ON_OPTIONS.map(o => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {revealed && pieceOnQ?.kind === 'piece-on' && (
              <span className={answers.pieceOn === pieceOnQ.answer ? 'viz-correct' : 'viz-wrong'}>
                {answers.pieceOn === pieceOnQ.answer ? 'Correct' : `Wrong — it was ${pieceOnQ.answer}`}
              </span>
            )}
          </div>

          <div className="viz-question">
            <p>{materialQ?.kind === 'material' ? materialQ.prompt : ''}</p>
            <input type="number" disabled={revealed} value={answers.material} onChange={e => setAnswers(a => ({ ...a, material: e.target.value }))} />
            {revealed && materialQ?.kind === 'material' && (
              <span className={isMaterialCorrect(answers.material, materialQ.answer) ? 'viz-correct' : 'viz-wrong'}>
                {isMaterialCorrect(answers.material, materialQ.answer) ? 'Correct' : `Wrong — it was ${materialQ.answer}`}
              </span>
            )}
          </div>

          {!revealed && (
            <button className="viz-check" onClick={checkAnswers}>
              Check answers
            </button>
          )}

          {revealed && end && (
            <div className="viz-end">
              <p>The end position:</p>
              <div className="viz-board">
                <Board fen={fenOf(end)} orientation="white" turnColor={turn(end)} dests={EMPTY_DESTS} movableColor={undefined} check={inCheck(end)} onMove={() => undefined} />
              </div>
              <button onClick={nextExercise}>Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
