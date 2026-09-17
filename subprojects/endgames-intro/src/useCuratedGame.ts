import { useCallback, useEffect, useRef } from 'react';
import type { UciEngine } from '@human-chess/engine';
import type { CuratedPosition } from '@human-chess/positions';
import { useEngineGame } from '@human-chess/play/react';
import { START_FEN } from '@human-chess/rules';
import { LESSON_OPPONENT } from './useLessonGame';

/**
 * Drives one attempt at a curated endgame (curated.ts's curatedEndgames: real positions from the
 * user's own chess.com games). Unlike the hard-coded ladder (useLessonGame.ts), a curated
 * position is never mirrored — it keeps its real recorded colours, and the learner plays the
 * side they actually played (`entry.playAs`). `useEngineGame` already drives whichever side's
 * turn it is, so when the FEN's side to move is the *other* side, the engine simply moves first
 * with no special-casing needed here. Plays against the same opponent the lessons use
 * (LESSON_OPPONENT), so it is genuinely reused, not a second full-strength instance.
 */
export function useCuratedGame(entry: CuratedPosition | undefined, engine: UciEngine | undefined) {
  const lastEntryId = useRef<string | undefined>(entry?.id);

  const hook = useEngineGame({
    startFen: entry?.fen ?? START_FEN,
    playerColor: entry?.playAs ?? 'white',
    engine,
    opponent: LESSON_OPPONENT,
  });
  const hookRestart = hook.restart;

  const restart = useCallback(() => {
    if (!entry) return;
    hookRestart({ startFen: entry.fen, playerColor: entry.playAs });
  }, [entry, hookRestart]);

  // Restart to the newly selected entry's own fen/colour whenever it changes (same shape as
  // useLessonGame.ts's lesson-change effect) — useEngineGame's initial state is only built once,
  // at mount, from whatever startFen/playerColor were current then.
  useEffect(() => {
    if (entry && lastEntryId.current !== entry.id) {
      lastEntryId.current = entry.id;
      restart();
    }
  }, [entry, restart]);

  return { ...hook, restart };
}
