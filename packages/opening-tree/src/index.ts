// A played-games opening tree over @human-chess/import's ImportedGame[]: per-move counts,
// results and per-node/per-edge stats, folded from one player's own side of one colour, EPD-keyed
// so transpositions merge. See tree.ts's header comment for the fuller design note (openingtree.com
// as design reference, not code; the v1/v2 split for GamesTreeView compatibility).
export {
  buildTree,
  buildGamesTree,
  childrenOf,
  fenAt,
  lineTo,
  mostPlayed,
  moveScore,
  DEFAULT_MAX_PLIES_PER_SIDE,
  START_FEN,
} from './tree';
export type {
  BuildGamesTreeOpts,
  BuildTreeOpts,
  GameRef,
  GamesTree,
  MoveResults,
  Source,
  TrackedGame,
  TreeMove,
  TreeNode,
  WDL,
} from './tree';

export { matchesFilter } from './filters';
export type { GameFilter } from './filters';

export { mostLostPositions, openingSummary, worstMoves } from './diagnostics';
export type { DiagnosticOpts, LostPositionEntry, OpeningSummaryEntry, WorstMoveEntry } from './diagnostics';
