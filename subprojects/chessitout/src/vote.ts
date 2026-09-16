// Vote judging for the Chessitout solo loop: right/wrong against the mining-time eval only —
// never against the "engine now" eval taken after play, which reflects the moves played rather
// than the read of the starting position. Pure; the Score it takes in is always a real
// White-perspective depth-10 engine result from @human-chess/positions' imbalanced-position
// mining (A1). In practice that mining only ever returns a 'cp' score (see
// packages/positions/src/imbalanced.ts), but this takes the full Score — not a bare cp number —
// so a 'mate' score is judged correctly wherever this is reused: a mate score is always decisive
// for the mating side, never "equal", regardless of how close to 0 the mate count is.
import type { Score } from '@human-chess/engine';

export type Vote = 'white' | 'black' | 'equal';

// First guess, not yet tuned by the user: how close to 0 still counts as "equal" for judging a
// cp vote. Never applied to a mate score, which is decisive by definition.
export const EQUALITY_BAND_CP = 30;

export function judgeVote(vote: Vote, score: Score): 'right' | 'wrong' {
  if (score.type === 'mate') {
    const betterSide: Vote = score.value >= 0 ? 'white' : 'black';
    return vote === betterSide ? 'right' : 'wrong';
  }
  if (Math.abs(score.value) <= EQUALITY_BAND_CP) return vote === 'equal' ? 'right' : 'wrong';
  const betterSide: Vote = score.value > 0 ? 'white' : 'black';
  return vote === betterSide ? 'right' : 'wrong';
}
