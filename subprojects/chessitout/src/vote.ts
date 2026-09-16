// Vote judging for the Chessitout solo loop: right/wrong against the mining-time eval only —
// never against the "engine now" eval taken after play, which reflects the moves played rather
// than the read of the starting position. Pure; the cp value it takes in is always a real
// White-perspective depth-10 engine result from @human-chess/positions' imbalanced-position
// mining (A1), which only ever returns cp (never mate) evals.
export type Vote = 'white' | 'black' | 'equal';

// First guess, not yet tuned by the user: how close to 0 still counts as "equal" for judging a vote.
export const EQUALITY_BAND_CP = 30;

export function judgeVote(vote: Vote, miningEvalWhiteCp: number): 'right' | 'wrong' {
  if (Math.abs(miningEvalWhiteCp) <= EQUALITY_BAND_CP) return vote === 'equal' ? 'right' : 'wrong';
  const betterSide: Vote = miningEvalWhiteCp > 0 ? 'white' : 'black';
  return vote === betterSide ? 'right' : 'wrong';
}
