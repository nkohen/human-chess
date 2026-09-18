import { useCallback, useEffect, useRef } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { maximalResistance, type Opponent } from '@human-chess/play';
import { useEngineGame } from '@human-chess/play/react';
import type { EndgameLesson } from '@human-chess/positions';
import type { Color } from '@human-chess/rules';
import { fenFor, randomColor } from './lessonAdapt';

// Module-level so the default stays a stable reference across renders (see @human-chess/play's
// useEngineGame for why: a fresh object per render would re-run its engine-move effect).
// Exported so useCuratedGame.ts's curated-position games play against the exact same opponent
// as the hard-coded lessons, rather than constructing a second maximalResistance() instance.
export const LESSON_OPPONENT = maximalResistance();

/**
 * Drives one attempt at a lesson on top of the generic `useEngineGame`: picks the learner's
 * colour, mirrors the lesson FEN for Black, and restarts (with a freshly rolled colour)
 * whenever the lesson itself changes.
 *
 * `initial`, when given, seeds the very first attempt from a restored snapshot instead of
 * rolling a fresh colour: the colour useLessonGame would otherwise roll in the ref below, plus
 * any moves already played. It is read once, in the state initialisers above (never an effect),
 * together with `lesson` — the id and the moves must land in the same render as each other and
 * as `lastLessonId`'s initial value, or the restart-on-id-change effect just below would see the
 * restored id as "new" and immediately wipe the replay it was meant to preserve.
 */
export function useLessonGame(
  lesson: EndgameLesson,
  engine: UciEngine | undefined,
  opponent: Opponent = LESSON_OPPONENT,
  initial?: { color: Color; moves?: readonly string[] },
) {
  const startColor = useRef<Color | undefined>(undefined);
  if (startColor.current === undefined) startColor.current = initial?.color ?? randomColor();
  const lastLessonId = useRef(lesson.id);

  const hook = useEngineGame({
    startFen: fenFor(lesson, startColor.current),
    playerColor: startColor.current,
    engine,
    opponent,
    ...(initial?.moves ? { initialMoves: initial.moves } : {}),
  });
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
