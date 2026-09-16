// Pure verdict logic: no engine calls, no React. The Score passed in must already be a real
// engine Analysis line turned into White's perspective (see @human-chess/engine's
// whitePerspective) — this module only decides who that number favours (A1).
import type { Score } from '@human-chess/engine';
import type { Color } from '@human-chess/rules';

export type Verdict = 'won' | 'lost' | 'draw';

/** Width of the draw band around zero, in centipawns: |cp| below this counts as a draw.
 * First guess (the user wants this tuned once real games are played). */
export const DRAW_BAND_CP = 30;

/**
 * Who the position favours, from the player's own point of view. `scoreWhitePerspective` is
 * White's evaluation (positive = better for White); a mate score always counts as a win for
 * whichever side it mates for, regardless of the draw band.
 */
export function verdict(scoreWhitePerspective: Score, playerColor: Color): Verdict {
  const winner: Color | 'draw' =
    scoreWhitePerspective.type === 'mate'
      ? scoreWhitePerspective.value >= 0
        ? 'white'
        : 'black'
      : Math.abs(scoreWhitePerspective.value) < DRAW_BAND_CP
        ? 'draw'
        : scoreWhitePerspective.value > 0
          ? 'white'
          : 'black';
  if (winner === 'draw') return 'draw';
  return winner === playerColor ? 'won' : 'lost';
}
