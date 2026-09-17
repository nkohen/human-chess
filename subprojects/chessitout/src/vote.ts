// Vote judging for the Chessitout solo loop: right/wrong against the mining-time eval only —
// never against the "engine now" eval taken after play, which reflects the moves played rather
// than the read of the starting position. Pure; the Score it takes in is always a real
// White-perspective depth-18 engine result from @human-chess/positions' imbalanced-position
// mining (A1), banded to 100-350 cp (see packages/positions/src/imbalanced.ts), so a cp score of
// exactly 0 cannot occur in practice — but this takes the full Score, not a bare cp number, so a
// 'mate' score is judged correctly wherever this is reused: a mate score is always decisive for
// the mating side, never a coin flip, regardless of how close to 0 the mate count is. There is no
// 'equal' vote (user, 2026-09-17: the band guarantees a real edge for one side); a cp score of
// exactly 0, were it ever to occur, is judged 'wrong' for either vote rather than treated as
// unjudgeable.
import type { Score } from '@human-chess/engine';

export type Vote = 'white' | 'black';

export function judgeVote(vote: Vote, score: Score): 'right' | 'wrong' {
  if (score.type === 'mate') {
    const betterSide: Vote = score.value >= 0 ? 'white' : 'black';
    return vote === betterSide ? 'right' : 'wrong';
  }
  // A cp score of exactly 0 cannot occur given the mining band (100-350 cp either side), but if
  // it ever did there is no side to call "right" against, so both votes are judged 'wrong'
  // rather than either being credited by accident.
  if (score.value === 0) return 'wrong';
  const betterSide: Vote = score.value > 0 ? 'white' : 'black';
  return vote === betterSide ? 'right' : 'wrong';
}
