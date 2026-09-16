// Move classification: pure functions, no engine calls. Every input is a Score that came from
// a real Analysis (A1) or, for a rule-ended game, a fact from @human-chess/rules' positionEnd —
// never a free-form guess.
import type { Score } from '@human-chess/engine';
import type { Color, GameEnd } from '@human-chess/rules';

export type Classification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'mate-lost' | 'mate-allowed';

// First-guess thresholds (cp loss, mover's perspective) borrowed from the Chess.com-style
// expected-points buckets mentioned in memory/subprojects/game-reviewer.md; not tuned against
// real games yet. A move at or above a threshold falls in that bucket or a worse one.
export const GOOD_MAX_LOSS_CP = 30;
export const INACCURACY_MAX_LOSS_CP = 100;
export const MISTAKE_MAX_LOSS_CP = 300;

export interface ClassifyResult {
  /** Centipawn loss from the mover's perspective; undefined whenever a mate score is involved
   * (a "how many centipawns was mate worth" number would be invented, not measured — A1). */
  lossCp: number | undefined;
  classification: Classification;
}

/** Score `s` restated from `mover`'s point of view; `s` is assumed to already be White-perspective. */
export function moverPerspective(s: Score, mover: Color): Score {
  return mover === 'white' ? s : { type: s.type, value: -s.value };
}

/**
 * Classifies one played move. `evalAfterBest` and `evalAfterPlayed` are both White-perspective
 * Scores (see review.ts for how each is derived from a real Analysis, never invented).
 */
export function classify(args: {
  mover: Color;
  isBest: boolean;
  evalAfterBest: Score;
  evalAfterPlayed: Score;
}): ClassifyResult {
  const { mover, isBest, evalAfterBest, evalAfterPlayed } = args;
  if (isBest) return { lossCp: 0, classification: 'best' };

  const moverBest = moverPerspective(evalAfterBest, mover);
  const moverPlayed = moverPerspective(evalAfterPlayed, mover);

  const mateForMoverBefore = moverBest.type === 'mate' && moverBest.value > 0;
  const mateAgainstMoverBefore = moverBest.type === 'mate' && moverBest.value < 0;
  const mateForMoverAfter = moverPlayed.type === 'mate' && moverPlayed.value > 0;
  const mateAgainstMoverAfter = moverPlayed.type === 'mate' && moverPlayed.value < 0;

  // Had a forced mate available and the played move gave it up (whether the position is now
  // merely good, lost, or drawn) — the clearest, most damaging failure mode, called out
  // explicitly rather than folded into a cp bucket that cannot represent "lost a mate".
  if (mateForMoverBefore && !mateForMoverAfter) {
    return { lossCp: undefined, classification: 'mate-lost' };
  }
  // Was not already facing a forced mate, and the played move let the opponent force one.
  if (!mateAgainstMoverBefore && mateAgainstMoverAfter) {
    return { lossCp: undefined, classification: 'mate-allowed' };
  }
  // Any other mate involvement (mate retained on both sides just with a different distance, or
  // a mate score landing exactly on a just-delivered checkmate — see terminalScore below): not
  // one of the two named failure modes, and not expressible as a cp loss. First guess: treat it
  // as a fine, non-"best" move rather than inventing a number.
  if (moverBest.type === 'mate' || moverPlayed.type === 'mate') {
    return { lossCp: undefined, classification: 'good' };
  }

  const lossCp = Math.max(0, moverBest.value - moverPlayed.value);
  if (lossCp < GOOD_MAX_LOSS_CP) return { lossCp, classification: 'good' };
  if (lossCp < INACCURACY_MAX_LOSS_CP) return { lossCp, classification: 'inaccuracy' };
  if (lossCp < MISTAKE_MAX_LOSS_CP) return { lossCp, classification: 'mistake' };
  return { lossCp, classification: 'blunder' };
}

/**
 * The White-perspective Score for a position that ends the game by rule (no engine call is
 * possible: a checkmate/stalemate position has no legal move to search from). A draw (stalemate,
 * insufficient material, fifty-move) is exactly cp 0 — not an estimate, the rules-verified
 * outcome. A checkmate is recorded as mate 0: the position IS checkmate, full stop; direction
 * (who delivered it) lives in `end.winner`, not in this score's sign, so it is never guessed.
 */
export function terminalScore(end: GameEnd): Score {
  if (end.kind === 'checkmate') return { type: 'mate', value: 0 };
  return { type: 'cp', value: 0 };
}
