// Which of the two visualization-trainer modes last showed: today's line-visualizing exercises,
// or the position-memorizer. Persisted per browser with the same guarded-localStorage pattern as
// subprojects/chessitout/src/positionSource.ts — reads and writes never throw, and a bad or
// missing stored value falls back to the default.
const KEY = 'human-chess.visualization-trainer.mode';

export type TrainerMode = 'lines' | 'memorize';
export const DEFAULT_TRAINER_MODE: TrainerMode = 'lines';

export function loadTrainerMode(): TrainerMode {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw === 'memorize' ? 'memorize' : DEFAULT_TRAINER_MODE;
  } catch {
    return DEFAULT_TRAINER_MODE;
  }
}

export function saveTrainerMode(mode: TrainerMode): void {
  try {
    globalThis.localStorage?.setItem(KEY, mode);
  } catch {
    // storage unavailable: the choice lives for this page only
  }
}
