// The editor screen: board on the left, the lesson's title/description plus the Steps list and
// the current step's editor on the right. Auto-saves on every edit (no Save button) by calling
// `onLessonChange` straight through to LessonBuilder's persisted library state.
//
// Two authoring flows share one board area, switched by `positionMode`/`recordingAnswer`:
//  - "Set up position" (BoardEditor): the author drags/places pieces; `composeFen` is tried on
//    every edit and only committed to the step when it is a legal position (A1/V3 — nothing
//    illegal is ever stored), otherwise the draft placement is kept on screen with an error so
//    the author can keep building toward a legal one (e.g. placing kings one at a time).
//  - "Annotate & write" (Board with onShapesChange): draws arrows/circles and edits the step's
//    prose; the board is not movable (`movableColor={undefined}`) since left-click must not try
//    to move a piece while annotating.
// A third, momentary mode — "Record answer" — makes the board movable so a played move becomes
// a challenge answer (validated by the rules library itself: only a move Board actually offered
// as a legal destination can be played).
//
// None of the per-step UI mode/draft state is persisted (docs/design/2026-09-18-reload-survival.md:
// transient authoring flags are not user-facing progress); it resets to "annotate, nothing in
// progress" on every step change, using the same render-time identity-change reset BuilderView
// uses for its own path state (subprojects/openings-builder/src/BuilderView.tsx).
import { useState, type ReactNode } from 'react';
import { Board, BoardEditor } from '@human-chess/board';
import { composeFen, emptyStep, isLegalFen, sanOfMove, type Lesson, type LessonStep } from '@human-chess/lessons';
import { inCheck, legalDests, playMove, positionFromFen, START_FEN, turn, type Color, type Role, type SquareName } from '@human-chess/rules';
import { Button, Field, Panel, SegmentedControl, Status, Toolbar, Workbench } from '@human-chess/ui';
import { addChallengeAnswer, removeChallengeAnswer, withChallenge, withChallengePrompt, withoutChallenge, withStepFen } from './challenge';
import { genStepId } from './ids';
import { insertStep, moveStep, removeStep } from './steps';

export interface EditorViewProps {
  lesson: Lesson;
  stepIndex: number;
  onLessonChange: (lesson: Lesson) => void;
  onStepIndexChange: (index: number) => void;
  onBack: () => void;
}

type PositionMode = 'setup' | 'annotate';

const START_PLACEMENT = START_FEN.split(' ')[0]!;
const EMPTY_PLACEMENT = '8/8/8/8/8/8/8/8';

export function EditorView({ lesson, stepIndex, onLessonChange, onStepIndexChange, onBack }: EditorViewProps): React.JSX.Element {
  const step = lesson.steps[stepIndex];

  const [uiStepId, setUiStepId] = useState(step?.id);
  const [positionMode, setPositionMode] = useState<PositionMode>('annotate');
  const [draftPlacement, setDraftPlacement] = useState(() => (step ? step.fen.split(' ')[0]! : START_PLACEMENT));
  const [toMove, setToMove] = useState<Color>(() => (step ? turn(positionFromFen(step.fen)) : 'white'));
  const [draftError, setDraftError] = useState<string | undefined>(undefined);
  const [pastedFen, setPastedFen] = useState('');
  const [pasteError, setPasteError] = useState<string | undefined>(undefined);
  const [recordingAnswer, setRecordingAnswer] = useState(false);
  const [addingChallenge, setAddingChallenge] = useState(false);

  if (uiStepId !== step?.id) {
    setUiStepId(step?.id);
    setPositionMode('annotate');
    setDraftError(undefined);
    setPastedFen('');
    setPasteError(undefined);
    setRecordingAnswer(false);
    setAddingChallenge(false);
    setDraftPlacement(step ? step.fen.split(' ')[0]! : START_PLACEMENT);
    setToMove(step ? turn(positionFromFen(step.fen)) : 'white');
  }

  const updateStep = (next: LessonStep): void => {
    const steps = lesson.steps.map((s, i) => (i === stepIndex ? next : s));
    onLessonChange({ ...lesson, steps, updatedAt: Date.now() });
  };

  const addStep = (): void => {
    const fen = step ? step.fen : START_FEN;
    const orientation = step ? step.orientation : 'white';
    const insertAt = lesson.steps.length === 0 ? 0 : stepIndex + 1;
    const steps = insertStep(lesson.steps, insertAt, emptyStep(genStepId(), fen, orientation));
    onLessonChange({ ...lesson, steps, updatedAt: Date.now() });
    onStepIndexChange(insertAt);
  };

  const deleteStepAt = (i: number): void => {
    if (!lesson.steps[i]) return;
    if (!window.confirm('Delete this step?')) return;
    const steps = removeStep(lesson.steps, i);
    onLessonChange({ ...lesson, steps, updatedAt: Date.now() });
    onStepIndexChange(Math.min(i, Math.max(steps.length - 1, 0)));
  };

  const moveStepAt = (i: number, direction: -1 | 1): void => {
    const steps = moveStep(lesson.steps, i, direction);
    onLessonChange({ ...lesson, steps, updatedAt: Date.now() });
    onStepIndexChange(i + direction);
  };

  const enterSetupMode = (): void => {
    if (!step) return;
    setDraftPlacement(step.fen.split(' ')[0]!);
    setToMove(turn(positionFromFen(step.fen)));
    setDraftError(undefined);
    setPositionMode('setup');
  };

  const commitDraft = (placement: string, toMoveColor: Color): void => {
    if (!step) return;
    try {
      const fen = composeFen(placement, toMoveColor);
      setDraftError(undefined);
      updateStep(withStepFen(step, fen));
    } catch {
      setDraftError('Not a legal position yet.');
    }
  };

  const applyPastedFen = (): void => {
    if (!step) return;
    const candidate = pastedFen.trim();
    if (!isLegalFen(candidate)) {
      setPasteError('That is not a legal position.');
      return;
    }
    setPasteError(undefined);
    updateStep(withStepFen(step, candidate));
    setDraftPlacement(candidate.split(' ')[0]!);
    setToMove(turn(positionFromFen(candidate)));
  };

  const useStartingPosition = (): void => {
    if (!step) return;
    updateStep(withStepFen(step, START_FEN));
    setDraftPlacement(START_PLACEMENT);
    setToMove('white');
    setDraftError(undefined);
  };

  const useEmptyBoard = (): void => {
    setDraftPlacement(EMPTY_PLACEMENT);
    setDraftError('Empty board — place pieces to build a legal position.');
  };

  const handleRecordedMove = (from: SquareName, to: SquareName, promotion?: Role): void => {
    if (!step) return;
    const pos = positionFromFen(step.fen);
    const played = playMove(pos, from, to, promotion);
    const challenge = step.challenge ? addChallengeAnswer(step.challenge, played.uci) : { answers: [played.uci] };
    updateStep(withChallenge(step, challenge));
    setRecordingAnswer(false);
    setAddingChallenge(false);
  };

  const toggleChallenge = (checked: boolean): void => {
    if (!step) return;
    if (checked) {
      setAddingChallenge(true);
    } else {
      setAddingChallenge(false);
      setRecordingAnswer(false);
      if (step.challenge) updateStep(withoutChallenge(step));
    }
  };

  const removeAnswer = (uci: string): void => {
    if (!step?.challenge) return;
    const next = removeChallengeAnswer(step.challenge, uci);
    if (next.answers.length === 0) {
      updateStep(withoutChallenge(step));
      setAddingChallenge(true);
    } else {
      updateStep(withChallenge(step, next));
    }
  };

  const renderBoard = (sizePx: number): ReactNode => {
    if (!step) {
      return (
        <div className="lb-board-placeholder" style={{ width: sizePx, height: sizePx }}>
          <Status kind="info">Add a step to begin.</Status>
        </div>
      );
    }
    const pos = positionFromFen(step.fen);
    if (recordingAnswer) {
      return (
        <Board
          fen={step.fen}
          orientation={step.orientation}
          turnColor={turn(pos)}
          dests={legalDests(pos)}
          movableColor={turn(pos)}
          check={inCheck(pos)}
          onMove={handleRecordedMove}
          size={`${sizePx}px`}
        />
      );
    }
    if (positionMode === 'setup') {
      return (
        <BoardEditor
          fen={draftPlacement}
          orientation={step.orientation}
          onChange={placement => {
            setDraftPlacement(placement);
            commitDraft(placement, toMove);
          }}
          size={`${sizePx}px`}
        />
      );
    }
    return (
      <Board
        fen={step.fen}
        orientation={step.orientation}
        turnColor={turn(pos)}
        dests={new Map()}
        movableColor={undefined}
        check={inCheck(pos)}
        // movableColor is undefined, so this is never actually invoked — annotate mode is
        // read-only for moves, only right-click drawing is live (Board's onShapesChange below).
        onMove={() => {}}
        shapes={step.shapes}
        onShapesChange={shapes => updateStep({ ...step, shapes })}
        size={`${sizePx}px`}
      />
    );
  };

  const renderStepPanel = (s: LessonStep): ReactNode => (
    <Panel title={`Step ${stepIndex + 1} of ${lesson.steps.length}`}>
      <Field label="Orientation">
        <SegmentedControl
          ariaLabel="Board orientation"
          options={[
            { value: 'white', label: 'White' },
            { value: 'black', label: 'Black' },
          ]}
          value={s.orientation}
          onChange={o => updateStep({ ...s, orientation: o })}
        />
      </Field>
      <Field label="Step mode">
        <SegmentedControl
          ariaLabel="Editing mode"
          options={[
            { value: 'annotate', label: 'Annotate & write' },
            { value: 'setup', label: 'Set up position' },
          ]}
          value={positionMode}
          onChange={m => (m === 'setup' ? enterSetupMode() : setPositionMode('annotate'))}
        />
      </Field>

      {positionMode === 'setup' ? (
        <div className="lb-setup">
          <Field label="Side to move">
            <SegmentedControl
              ariaLabel="Side to move"
              options={[
                { value: 'white', label: 'White' },
                { value: 'black', label: 'Black' },
              ]}
              value={toMove}
              onChange={c => {
                setToMove(c);
                commitDraft(draftPlacement, c);
              }}
            />
          </Field>
          {draftError && <Status kind="error">{draftError}</Status>}
          <Toolbar>
            <Button size="sm" variant="quiet" onClick={useStartingPosition}>
              Starting position
            </Button>
            <Button size="sm" variant="quiet" onClick={useEmptyBoard}>
              Empty board
            </Button>
          </Toolbar>
          <Field label="Paste FEN" htmlFor="lb-paste-fen">
            <input id="lb-paste-fen" value={pastedFen} onChange={e => setPastedFen(e.target.value)} placeholder="Paste a FEN" />
          </Field>
          {pasteError && <Status kind="error">{pasteError}</Status>}
          <Button size="sm" onClick={applyPastedFen} disabled={pastedFen.trim().length === 0}>
            Use this FEN
          </Button>
        </div>
      ) : (
        <div className="lb-annotate">
          <Field label="Step text" htmlFor="lb-step-text">
            <textarea id="lb-step-text" rows={4} value={s.text} onChange={e => updateStep({ ...s, text: e.target.value })} />
          </Field>
          <Button size="sm" variant="quiet" onClick={() => updateStep({ ...s, shapes: [] })} disabled={s.shapes.length === 0}>
            Clear annotations
          </Button>
        </div>
      )}

      <fieldset className="lb-challenge-block">
        <legend>Challenge</legend>
        <label className="lb-challenge-toggle">
          <input type="checkbox" checked={s.challenge !== undefined || addingChallenge} onChange={e => toggleChallenge(e.target.checked)} />
          Ask the learner to play a move
        </label>
        {(s.challenge !== undefined || addingChallenge) && (
          <div className="lb-challenge">
            {s.challenge && s.challenge.answers.length > 0 && (
              <ul className="lb-challenge-answers">
                {s.challenge.answers.map(uci => (
                  <li key={uci}>
                    <span>{sanOfMove(s.fen, uci) ?? uci}</span>
                    <Button size="sm" variant="quiet" aria-label={`Remove ${uci} as an accepted answer`} onClick={() => removeAnswer(uci)}>
                      ×
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {recordingAnswer ? (
              <div className="lb-challenge-recording">
                <Status kind="info">Play the move on the board that should count as correct.</Status>
                <Button size="sm" variant="quiet" onClick={() => setRecordingAnswer(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setRecordingAnswer(true)}>
                Record answer
              </Button>
            )}
            {s.challenge && (
              <Field label="Prompt (optional)" htmlFor="lb-challenge-prompt">
                <input
                  id="lb-challenge-prompt"
                  value={s.challenge.prompt ?? ''}
                  onChange={e => {
                    const challenge = s.challenge;
                    if (challenge) updateStep(withChallenge(s, withChallengePrompt(challenge, e.target.value)));
                  }}
                />
              </Field>
            )}
          </div>
        )}
      </fieldset>
    </Panel>
  );

  const lessonMetaPanel = (
    <Panel title="Lesson">
      <Field label="Title" htmlFor="lb-lesson-title">
        <input
          id="lb-lesson-title"
          value={lesson.title}
          onChange={e => onLessonChange({ ...lesson, title: e.target.value, updatedAt: Date.now() })}
        />
      </Field>
      <Field label="Description" htmlFor="lb-lesson-desc">
        <textarea
          id="lb-lesson-desc"
          rows={3}
          value={lesson.description}
          onChange={e => onLessonChange({ ...lesson, description: e.target.value, updatedAt: Date.now() })}
        />
      </Field>
    </Panel>
  );

  return (
    <Workbench
      title={lesson.title || 'Untitled lesson'}
      footer={
        <Toolbar>
          <Button variant="quiet" onClick={onBack}>
            Back to library
          </Button>
        </Toolbar>
      }
      board={renderBoard}
    >
      <Panel title="Steps">
        <ul className="lb-steps">
          {lesson.steps.map((s, i) => (
            <li key={s.id} className={i === stepIndex ? 'lb-steps__item lb-steps__item--selected' : 'lb-steps__item'}>
              <button type="button" className="lb-steps__select" onClick={() => onStepIndexChange(i)}>
                {i + 1}. {s.text.trim() ? s.text.trim().slice(0, 40) : '(no text yet)'}
              </button>
              <div className="lb-steps__actions">
                <Button size="sm" variant="quiet" aria-label="Move step up" onClick={() => moveStepAt(i, -1)} disabled={i === 0}>
                  ↑
                </Button>
                <Button size="sm" variant="quiet" aria-label="Move step down" onClick={() => moveStepAt(i, 1)} disabled={i === lesson.steps.length - 1}>
                  ↓
                </Button>
                <Button size="sm" variant="quiet" aria-label="Delete step" onClick={() => deleteStepAt(i)}>
                  ×
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button size="sm" onClick={addStep}>
          Add step
        </Button>
      </Panel>
      {step ? renderStepPanel(step) : <Status kind="info">No steps yet — add one to begin.</Status>}
      {lessonMetaPanel}
    </Workbench>
  );
}
