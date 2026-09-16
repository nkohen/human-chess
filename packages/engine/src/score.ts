// Score perspective and formatting. `packages/engine` must not depend on `packages/rules` (it
// is the only package chessops imports into), so the side to move is typed as the raw union
// rather than importing rules' Color.
import type { Score } from './uci';

/** UCI reports scores from the side to move's point of view; this flips a Black-to-move score to White's. */
export function whitePerspective(score: Score, sideToMove: 'white' | 'black'): Score {
  if (sideToMove === 'white') return score;
  return { type: score.type, value: -score.value };
}

export function formatPawns(cp: number): string {
  const pawns = cp / 100;
  const sign = pawns > 0 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

/** A Score as plain text: "+1.3 pawns" or "mate in 4 for White". */
export function formatScore(score: Score): string {
  if (score.type === 'mate') {
    if (score.value === 0) return 'checkmate';
    return `mate in ${Math.abs(score.value)} for ${score.value >= 0 ? 'White' : 'Black'}`;
  }
  return `${formatPawns(score.value)} pawns`;
}
