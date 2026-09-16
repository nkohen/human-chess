// Move classification: pure functions, no engine calls. Every input is a Score that came from
// a real Analysis (A1) or, for a rule-ended game, a fact from @human-chess/rules' positionEnd —
// never a free-form guess.
import type { Score } from '@human-chess/engine';
import type { Color, GameEnd } from '@human-chess/rules';

export type Classification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'mate-lost' | 'mate-allowed';

/** A drawn game's rules-verified reason, i.e. every GameEnd kind except checkmate. */
export type DrawReason = Exclude<GameEnd['kind'], 'checkmate'>;

/**
 * The evaluation of a position after a move, White-perspective — either a real engine Score, or,
 * when that move ended the game, the rules-verified terminal fact itself (see terminalEval).
 * A delivered checkmate is never represented as a Score: "mate in 0" or a cp number would both
 * be inventions about a position that has no legal move left to search from (A1). The winner is
 * carried explicitly rather than encoded in a sign, so a checkmate can never be misread as a
 * loss for the side that just delivered it.
 */
export type EvalOrEnd = Score | { type: 'checkmate'; winner: Color } | { type: 'draw'; reason: DrawReason };

/** `e` restated as a Score for cp/mate-distance comparisons: a checkmate has no meaningful
 * distance left (mate 0), a draw is exactly cp 0 — both rules-verified facts, not estimates. */
function asScore(e: EvalOrEnd): Score {
  if (e.type === 'checkmate') return { type: 'mate', value: 0 };
  if (e.type === 'draw') return { type: 'cp', value: 0 };
  return e;
}

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
  evalAfterPlayed: EvalOrEnd;
}): ClassifyResult {
  const { mover, isBest, evalAfterBest, evalAfterPlayed } = args;

  // A move that delivers checkmate is unimprovable — nothing beats ending the game on the spot
  // — regardless of whether it happens to be the engine's own first-choice mating line (many
  // different moves can mate immediately; the engine's bestmove names only one of them). This
  // must be checked before the isBest branch so a non-bestmove checkmate is never reported as
  // "mate lost" or scored as if the position still had a searchable eval.
  if (evalAfterPlayed.type === 'checkmate' && evalAfterPlayed.winner === mover) {
    return { lossCp: 0, classification: 'best' };
  }

  if (isBest) return { lossCp: 0, classification: 'best' };

  const moverBest = moverPerspective(evalAfterBest, mover);
  const moverPlayed = moverPerspective(asScore(evalAfterPlayed), mover);

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
  // Any other mate involvement (mate retained on both sides just with a different distance): not
  // one of the two named failure modes, and not expressible as a cp loss. First guess: treat it
  // as a fine, non-"best" move rather than inventing a number. (A just-delivered checkmate is
  // never reached here — it is caught above, before the isBest branch, via terminalEval below.)
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
 * The evaluation of a position that ends the game by rule (no engine call is possible: a
 * checkmate/stalemate position has no legal move to search from). Represented as the distinct
 * EvalOrEnd terminal variants, never as a Score: a checkmate is not "mate 0" (which would read
 * as a near-mate still to be found) or a cp number, it IS the game over, with the winner carried
 * explicitly rather than guessed from a sign. A draw carries its rules-verified reason.
 */
export function terminalEval(end: GameEnd): EvalOrEnd {
  if (end.kind === 'checkmate') return { type: 'checkmate', winner: end.winner };
  return { type: 'draw', reason: end.kind };
}
