// A played-games opening tree over @human-chess/import's ImportedGame[]: per-move counts and
// results, folded from one player's own side of one colour. See tree.ts's header comment for
// the fuller design note (and why this is not a port of openingtree.com).
export {
  buildGamesTree,
  childrenOf,
  fenAt,
  mostPlayed,
  moveScore,
  DEFAULT_MAX_PLIES_PER_SIDE,
  START_FEN,
} from './tree';
export type { BuildGamesTreeOpts, GameRef, GamesTree, MoveResults, TreeMove, TreeNode } from './tree';
