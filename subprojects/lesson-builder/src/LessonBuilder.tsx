// The Lesson Builder shell: switches between the three screens (library, editor, player) and
// owns the two persisted pieces of state (docs/design/2026-09-18-reload-survival.md) — the whole
// lesson library and which screen/lesson/step is showing. Both are seeded in usePersistedState's
// initialiser (never an effect) and validated on read via @human-chess/lessons/viewState.ts, so a
// reload lands back exactly where the author or learner left off.
import { useEffect } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { emptyLesson, parseLessonList, type Lesson } from '@human-chess/lessons';
import { usePersistedState } from '@human-chess/ui';
import { genLessonId } from './ids';
import { LESSONS_STORAGE_KEY, VIEW_STORAGE_KEY } from './keys';
import { LibraryView } from './LibraryView';
import { EditorView } from './EditorView';
import { PlayerView } from './PlayerView';
import { INITIAL_VIEW_STATE, parseViewState, type LessonBuilderViewState } from './viewState';
import './lesson-builder.css';

export interface LessonBuilderProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not
   * load. Only needed by a play-out step in the player. */
  engine: UciEngine | Error | undefined;
}

export function LessonBuilder({ engine }: LessonBuilderProps): React.JSX.Element {
  const [lessons, setLessons] = usePersistedState<Lesson[]>(LESSONS_STORAGE_KEY, [], { parse: parseLessonList });
  const [view, setView] = usePersistedState<LessonBuilderViewState>(VIEW_STORAGE_KEY, INITIAL_VIEW_STATE, { parse: parseViewState });

  const currentLesson = view.lessonId !== undefined ? lessons.find(l => l.id === view.lessonId) : undefined;

  // Self-heals a stale reference (the lesson the view pointed at was deleted, in this tab or
  // another) back to the library, rather than leaving the persisted view state pointing at
  // nothing forever. The render below already falls back to LibraryView in the meantime.
  useEffect(() => {
    if (view.view !== 'library' && view.lessonId !== undefined && !lessons.some(l => l.id === view.lessonId)) {
      setView({ view: 'library', stepIndex: 0, solved: false, moves: [] });
    }
  }, [view.view, view.lessonId, lessons, setView]);

  const goLibrary = (): void => setView({ view: 'library', stepIndex: 0, solved: false, moves: [] });
  const goEditor = (lessonId: string, stepIndex: number): void => setView({ view: 'editor', lessonId, stepIndex, solved: false, moves: [] });
  const goPlayer = (lessonId: string, stepIndex: number): void => setView({ view: 'player', lessonId, stepIndex, solved: false, moves: [] });

  const handleNewLesson = (): void => {
    const lesson = emptyLesson(genLessonId(), Date.now());
    setLessons(prev => [...prev, lesson]);
    goEditor(lesson.id, 0);
  };
  const handleDeleteLesson = (id: string): void => setLessons(prev => prev.filter(l => l.id !== id));
  const handleImportLesson = (lesson: Lesson): void => setLessons(prev => [...prev, { ...lesson, id: genLessonId() }]);
  const handleUpdateLesson = (updated: Lesson): void => setLessons(prev => prev.map(l => (l.id === updated.id ? updated : l)));

  if (view.view === 'editor' && currentLesson) {
    const stepIndex = Math.min(view.stepIndex, Math.max(currentLesson.steps.length - 1, 0));
    return (
      <EditorView
        lesson={currentLesson}
        stepIndex={stepIndex}
        onLessonChange={handleUpdateLesson}
        onStepIndexChange={i => setView(v => ({ ...v, stepIndex: i }))}
        onBack={goLibrary}
      />
    );
  }
  if (view.view === 'player' && currentLesson) {
    const stepIndex = Math.min(view.stepIndex, Math.max(currentLesson.steps.length - 1, 0));
    // If a reload (or a lesson edited/re-imported to fewer steps) clamps the index onto a
    // *different* step than was saved, the persisted `solved`/`moves` belonged to the old step —
    // carrying them over would show an unsolved challenge as already solved, or resume a play-out
    // game on the wrong position. Only trust them when the index didn't move.
    const indexUnchanged = stepIndex === view.stepIndex;
    const solved = indexUnchanged && view.solved;
    const moves = indexUnchanged ? (view.moves ?? []) : [];
    return (
      <PlayerView
        lesson={currentLesson}
        stepIndex={stepIndex}
        solved={solved}
        onStepChange={(i, solved) => setView(v => ({ ...v, stepIndex: i, solved, moves: [] }))}
        moves={moves}
        onMovesChange={m => setView(v => ({ ...v, moves: m }))}
        onBack={goLibrary}
        engine={engine}
      />
    );
  }
  return (
    <LibraryView
      lessons={lessons}
      onNew={handleNewLesson}
      onEdit={id => goEditor(id, 0)}
      onPlay={id => goPlayer(id, 0)}
      onDelete={handleDeleteLesson}
      onImport={handleImportLesson}
    />
  );
}
