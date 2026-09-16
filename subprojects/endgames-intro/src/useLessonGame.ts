import { useCallback, useEffect, useRef } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { maximalResistance, type Opponent } from '@human-chess/play';
import { useEngineGame } from '@human-chess/play/react';
import type { EndgameLesson } from '@human-chess/positions';
import type { Color } from '@human-chess/rules';
import { fenFor, randomColor } from './lessonAdapt';

// Module-level so the default stays a stable reference across renders (see @human-chess/play's
// useEngineGame for why: a fresh object per render would re-run its engine-move effect).
const DEFAULT_OPPONENT = maximalResistance();

/**
 * Drives one attempt at a lesson on top of the generic `useEngineGame`: picks the learner's
 * colour, mirrors the lesson FEN for Black, and restarts (with a freshly rolled colour)
 * whenever the lesson itself changes.
 */
export function useLessonGame(lesson: EndgameLesson, engine: UciEngine | undefined, opponent: Opponent = DEFAULT_OPPONENT) {
  const startColor = useRef<Color | undefined>(undefined);
  if (startColor.current === undefined) startColor.current = randomColor();
  const lastLessonId = useRef(lesson.id);

  const hook = useEngineGame({ startFen: fenFor(lesson, startColor.current), playerColor: startColor.current, engine, opponent });
  const hookRestart = hook.restart;

  const restart = useCallback(
    (l: EndgameLesson = lesson) => {
      const color = randomColor();
      startColor.current = color;
      lastLessonId.current = l.id;
      hookRestart({ startFen: fenFor(l, color), playerColor: color });
    },
    [lesson, hookRestart],
  );

  useEffect(() => {
    if (lastLessonId.current !== lesson.id) restart(lesson);
  }, [lesson, restart]);

  return { ...hook, restart };
}
