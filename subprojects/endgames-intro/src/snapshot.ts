// Page-reload survival for the EndgamesIntro screen (docs/design/2026-09-18-reload-survival.md):
// one snapshot object under one key, read synchronously in EndgamesIntro's state initialisers
// and written back whenever the relevant pieces of state change. `confident`
// (progress.ts's loadConfident/saveConfident) and the meta-handoff-dismissed flag are already
// persisted separately and are untouched here. Never stores a chessops Position: the lesson and
// curated modes are each resolved back to their real objects by id/fen lookup, and the game in
// progress is a start fen plus a UCI move list, replayed through @human-chess/play's
// resumeGame — never invented (A1).
import { curatedEndgames, endgameLadder, type CuratedPosition, type EndgameLesson } from '@human-chess/positions';
import { resumeGame } from '@human-chess/play';
import type { Color } from '@human-chess/rules';
import { isBoolean, isOneOf, isRecord, isString, isStringArray } from '@human-chess/ui';
import { fenFor } from './lessonAdapt';

export const SNAPSHOT_KEY = 'human-chess.endgames-intro.session.v1';

export type Mode = 'lesson' | 'curated';
const isMode = isOneOf(['lesson', 'curated'] as const);
const isColor = isOneOf(['white', 'black'] as const);

export interface EndgamesSnapshot {
  mode: Mode;
  lesson: EndgameLesson;
  curatedEntry: CuratedPosition | undefined;
  showIntro: boolean;
  /** The colour useLessonGame.ts rolled for the current lesson attempt — restored so the
   * game keeps its colour instead of re-rolling on every reload. */
  startColor: Color;
  /** UCI moves played so far in whichever mode is active (empty for the inactive one, which is
   * never shown and so has nothing user-facing to restore). */
  moves: string[];
}

/** Validates the decoded JSON and rejects (returns undefined) any shape that is not current, or
 * whose move list does not legally replay against the resolved lesson/curated position — never
 * half-restored (A1). */
export function parseEndgamesSnapshot(raw: unknown): EndgamesSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  const { mode, lessonId, curatedEntryId, showIntro, startColor, moves } = raw;
  if (!isMode(mode) || !isString(lessonId) || !isBoolean(showIntro) || !isColor(startColor) || !isStringArray(moves)) return undefined;
  if (curatedEntryId !== undefined && !isString(curatedEntryId)) return undefined;

  const lesson = endgameLadder.find(l => l.id === lessonId);
  if (!lesson) return undefined;

  const curatedEntry = curatedEntryId !== undefined ? curatedEndgames.find(e => e.id === curatedEntryId) : undefined;
  if (curatedEntryId !== undefined && !curatedEntry) return undefined;
  if (mode === 'curated' && !curatedEntry) return undefined;

  if (moves.length > 0) {
    try {
      if (mode === 'curated') {
        resumeGame(curatedEntry!.fen, curatedEntry!.playAs, moves);
      } else {
        resumeGame(fenFor(lesson, startColor), startColor, moves);
      }
    } catch {
      return undefined; // illegal or corrupt move list: reject the whole snapshot
    }
  }

  return { mode, lesson, curatedEntry, showIntro, startColor, moves };
}
