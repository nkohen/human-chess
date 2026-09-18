// Pure geometry for the promotion picker overlay Board.tsx draws over the destination square.
// Kept out of Board.tsx and DOM-free so it can be unit tested: this workspace's vitest has no
// jsdom/browser environment configured (see vitest.config.ts and CLAUDE.md's "Getting started"),
// so anything that needs the DOM is untestable here and this file deliberately doesn't need it.
import type { Color, Role, SquareName } from '@human-chess/rules';

/** lichess's own picker order: queen first (the overwhelming case), then knight, rook, bishop. */
export const PROMOTION_ROLES: readonly Role[] = ['queen', 'knight', 'rook', 'bishop'];

export interface PromotionSquare {
  role: Role;
  /** Percentage of the board's width/height, top-left corner — chessground's own square sizing
   * (12.5% per file/rank), so these line up with the board underneath at any board size. */
  leftPct: number;
  topPct: number;
}

/**
 * The four picker squares, stacked from the destination square inward (toward the middle of the
 * board, away from the edge rank) so they read top-to-bottom regardless of which side promotes
 * or which way the board is oriented — lichess's own layout. `to` is always rank 1 or 8
 * (Board.tsx only calls this once @human-chess/rules's `isPromotionMove` says so), so it is
 * always on the board's top or bottom display row in either orientation.
 */
export function promotionSquareLayout(to: SquareName, orientation: Color): PromotionSquare[] {
  const file = to.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(to[1]) - 1;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  const step = row === 0 ? 1 : -1; // stack away from the edge row (0 or 7) toward the centre
  return PROMOTION_ROLES.map((role, i) => ({ role, leftPct: col * 12.5, topPct: (row + step * i) * 12.5 }));
}
