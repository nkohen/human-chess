// Diagnostic views over an already-built GamesTree: which of the tracked player's own moves
// scored worst, which positions cost the most losses, and a per-opening rollup. Pure
// aggregations over what `buildTree` already folded — "worst"/"most lost" here is only ever the
// tree's own recorded win/draw/loss counts, never an engine judgement or a generated claim
// (A1/V3).
import { positionFromFen, turn } from '@human-chess/rules';
import { buildCameFrom, lineFromCameFrom, type GamesTree, type TreeMove, type TreeNode, type WDL } from './tree';

export interface DiagnosticOpts {
  minGames?: number;
  limit?: number;
}

const DEFAULT_MIN_GAMES = 5;
const DEFAULT_LIMIT = 10;

export interface WorstMoveEntry {
  epd: string;
  move: TreeMove;
  /** SAN from the tree's root along the most-played path to `epd` (see `lineTo`). */
  line: string[];
}

/**
 * The tracked player's own moves with the lowest score (points/games), restricted to nodes
 * where it was their turn to move — an opponent's reply is never judged here, only decisions the
 * player actually made. `minGames` (default 5) filters out moves played too rarely to mean
 * anything; ties (equal score) are broken by more games first, since a low score over many games
 * is a stronger signal than the same score over a handful.
 */
export function worstMoves(tree: GamesTree, opts: DiagnosticOpts = {}): WorstMoveEntry[] {
  // Clamp to at least 1: `minGames: 0` would otherwise let a count-0 move through below (no real
  // edge has count 0, so this is defensive rather than load-bearing here, but keeps the same
  // convention as mostLostPositions).
  const minGames = Math.max(opts.minGames ?? DEFAULT_MIN_GAMES, 1);
  const limit = opts.limit ?? DEFAULT_LIMIT;
  // One BFS for the whole tree, reused for every entry below, instead of the O(nodes) BFS
  // `lineTo` would otherwise rerun per entry.
  const cameFrom = buildCameFrom(tree);
  const entries: WorstMoveEntry[] = [];
  for (const node of tree.nodes.values()) {
    if (turn(positionFromFen(node.epd)) !== tree.color) continue;
    for (const move of node.moves) {
      if (move.count < minGames) continue;
      entries.push({ epd: node.epd, move, line: lineFromCameFrom(cameFrom, tree.root, node.epd) });
    }
  }
  entries.sort((a, b) => a.move.score - b.move.score || b.move.count - a.move.count);
  return entries.slice(0, limit);
}

export interface LostPositionEntry {
  epd: string;
  node: TreeNode;
  line: string[];
}

/**
 * Positions ranked by how many folded games were lost from there — either side to move, since
 * this tracks where the player's results actually went wrong on the board, not just where their
 * own decisions were. `minGames` filters out positions reached too rarely to mean anything; ties
 * (equal loss count) are broken by loss rate (losses/games).
 */
export function mostLostPositions(tree: GamesTree, opts: DiagnosticOpts = {}): LostPositionEntry[] {
  // Clamp to at least 1 — `minGames: 0` would otherwise let `node.games === 0` nodes through the
  // filter below (`0 < 0` is false), and the loss-rate tiebreak divides by `node.games`, so a
  // 0-game node there would compare as 0/0 = NaN.
  const minGames = Math.max(opts.minGames ?? DEFAULT_MIN_GAMES, 1);
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const cameFrom = buildCameFrom(tree);
  const entries: LostPositionEntry[] = [];
  for (const node of tree.nodes.values()) {
    if (node.games < minGames) continue;
    entries.push({ epd: node.epd, node, line: lineFromCameFrom(cameFrom, tree.root, node.epd) });
  }
  entries.sort((a, b) => {
    if (b.node.results.losses !== a.node.results.losses) return b.node.results.losses - a.node.results.losses;
    return b.node.results.losses / b.node.games - a.node.results.losses / a.node.games;
  });
  return entries.slice(0, limit);
}

export interface OpeningSummaryEntry {
  eco?: string | undefined;
  name: string;
  games: number;
  results: WDL;
  score: number;
}

/**
 * One row per opening name (falling back to the ECO code, then 'Unknown'), aggregated straight
 * from each tracked game's own header meta — never re-derived from the tree's positions (a
 * game's [ECO]/[Opening] headers are the source of truth for "what opening was this"; the tree's
 * nodes are for the move-by-move breakdown). Sorted by games played, descending.
 */
export function openingSummary(tree: GamesTree): OpeningSummaryEntry[] {
  const byName = new Map<string, OpeningSummaryEntry>();
  for (const game of tree.games) {
    const name = game.openingName ?? game.eco ?? 'Unknown';
    let entry = byName.get(name);
    if (!entry) {
      entry = { eco: game.eco, name, games: 0, results: { wins: 0, draws: 0, losses: 0 }, score: 0 };
      byName.set(name, entry);
    }
    entry.games += 1;
    if (game.result === 'win') entry.results.wins += 1;
    else if (game.result === 'draw') entry.results.draws += 1;
    else entry.results.losses += 1;
  }
  const rows = [...byName.values()];
  for (const row of rows) row.score = row.games > 0 ? (row.results.wins + row.results.draws * 0.5) / row.games : 0;
  rows.sort((a, b) => b.games - a.games);
  return rows;
}
