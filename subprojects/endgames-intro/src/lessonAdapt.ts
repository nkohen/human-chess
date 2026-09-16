// Lesson-specific glue on top of the generic engine-game machinery in @human-chess/play:
// choosing the learner's colour, mirroring the lesson FEN when they play Black (lessons are
// written with White to move and winning), and mapping the generic win/lost/draw result onto
// this subproject's beginner-facing won/not-won framing.
import type { Result } from '@human-chess/play';
import type { EndgameLesson } from '@human-chess/positions';
import { fenOf, mirrorColors, positionFromFen, type Color } from '@human-chess/rules';

export const randomColor = (): Color => (Math.random() < 0.5 ? 'white' : 'black');

/** The lesson's FEN as the learner will see it: unchanged for White, mirrored (colours swapped,
 * board flipped) for Black, so the learner's own colour is always the one working out the win. */
export function fenFor(lesson: EndgameLesson, color: Color): string {
  return color === 'white' ? lesson.fen : fenOf(mirrorColors(positionFromFen(lesson.fen)));
}

export type LessonOutcome = 'won' | 'not-won' | undefined;

/** Only a win is worth celebrating in this beginner-facing subproject; a loss and a draw both
 * mean "try again". */
export function lessonOutcome(result: Result): LessonOutcome {
  if (result === undefined) return undefined;
  return result === 'won' ? 'won' : 'not-won';
}
