// The played-games opening tree: folds a set of already-imported games (from
// @human-chess/import) into a position graph, from one player's own perspective and one colour
// — "which of my moves (and which opponent replies) have I actually faced, and how did those
// games turn out" (memory/subprojects/openings-builder-trainer.md, priority 2: "analysis through
// an opening tree over the user's own games"). Deliberately NOT ported from openingtree.com
// (GPL-3.0, would need its own memory/reuse-library.md entry per file) — this is a small,
// independent implementation of the same idea: a repertoire-style position graph
// (subprojects/openings-builder/src/repertoire.ts) keyed by EPD, with per-move game outcomes.
//
// Pure and React-free, like repertoire.ts; the only chess dependency is @human-chess/rules
// (playUci, repetitionKey — nothing here judges legality or re-derives notation).
import { fenOf, playUci, positionFromFen, repetitionKey, RulesError, START_FEN, type Color } from '@human-chess/rules';
import type { ImportedGame } from '@human-chess/import';

export { START_FEN };

/** Enough to trace a move back to the game it came from, without carrying the whole
 * ImportedGame (headers, full move list, ...) into every edge. */
export interface GameRef {
  url: string | undefined;
  playedAt: string | undefined;
  opponent: string | undefined;
}

export interface MoveResults {
  wins: number;
  draws: number;
  losses: number;
}

/** One edge out of a node: the move played, how many (folded) games played it, the results of
 * those games from the tree's own colour's side, and which games they were. */
export interface TreeMove {
  uci: string;
  san: string;
  /** EPD (repetitionKey) of the resulting position. */
  to: string;
  count: number;
  results: MoveResults;
  games: GameRef[];
}

export interface TreeNode {
  moves: TreeMove[];
}

export interface GamesTree {
  /** The username and colour this tree was folded from `username`'s side of — every folded
   * game had `username` playing `color`, and every result is that side's win/draw/loss. */
  username: string;
  color: Color;
  /** EPD (repetitionKey) of the starting position. */
  root: string;
  /** Keyed by EPD; transpositions across (and within) games land on the same node. */
  nodes: Record<string, TreeNode>;
  /** How many plies per side were folded from each game (the constructor's `maxPliesPerSide`
   * option) — a game longer than this is still folded, just truncated at this depth. */
  maxPliesPerSide: number;
  /** Games actually folded into the tree (played `username`/`color`, with a decisive result and
   * at least one move). */
  gamesFolded: number;
  /** Games handed in but not folded: wrong colour/username, no result yet ('*', e.g. an ongoing
   * or aborted game), or zero moves. Never silently merged into gamesFolded — a caller showing
   * "N of M games used" needs both numbers. */
  gamesSkipped: number;
}

export interface BuildGamesTreeOpts {
  /** Plies folded per side, i.e. up to `2 * maxPliesPerSide` total plies per game. Default 20
   * (a first guess — deep enough to cover most opening theory, shallow enough that folding
   * hundreds of games stays fast; not measured against real repertoire depths). */
  maxPliesPerSide?: number;
}

export const DEFAULT_MAX_PLIES_PER_SIDE = 20;

/** `username` played `color` in `game`, matched case-insensitively against the White/Black
 * headers — the same rule packages/import/src/parse.ts uses for ImportedGame.playedAs, but
 * recomputed here against the *caller's* `username` rather than trusting `game.playedAs`,
 * because a pasted-PGN ImportedGame (importPgn, used by this package's own tests) always has
 * `username` and `playedAs` undefined. */
function playedColorFor(game: ImportedGame, username: string): Color | undefined {
  const lower = username.toLowerCase();
  if (game.white?.toLowerCase() === lower) return 'white';
  if (game.black?.toLowerCase() === lower) return 'black';
  return undefined;
}

/** The tree colour's side's outcome of `result` (a PGN Result header value), or undefined for
 * anything that isn't a decisive result ('*', missing, or a malformed value) — such a game
 * can't be attributed a win/draw/loss, so buildGamesTree skips it entirely rather than folding
 * moves with no result to attach to them. */
function outcomeFor(result: string | undefined, color: Color): keyof MoveResults | undefined {
  if (result === '1-0') return color === 'white' ? 'wins' : 'losses';
  if (result === '0-1') return color === 'white' ? 'losses' : 'wins';
  if (result === '1/2-1/2') return 'draws';
  return undefined;
}

function emptyResults(): MoveResults {
  return { wins: 0, draws: 0, losses: 0 };
}

function nodeAt(nodes: Record<string, TreeNode>, epd: string): TreeNode {
  return (nodes[epd] ??= { moves: [] });
}

/** Merges one game's already-folded edges (from `foldGame`, into its own scratch `nodes`) into
 * the tree's real `nodes`, adding counts/results/games onto whatever edge is already there
 * rather than overwriting it — the same "find or create, then increment" rule `foldGame` itself
 * uses one level up. Only ever called after a game's whole fold has succeeded (see
 * `buildGamesTree`), so a game that throws partway through never contributes partial counts. */
function mergeGameNodes(nodes: Record<string, TreeNode>, gameNodes: Record<string, TreeNode>): void {
  for (const [epd, gameNode] of Object.entries(gameNodes)) {
    const node = nodeAt(nodes, epd);
    for (const src of gameNode.moves) {
      let edge = node.moves.find(m => m.uci === src.uci);
      if (!edge) {
        edge = { uci: src.uci, san: src.san, to: src.to, count: 0, results: emptyResults(), games: [] };
        node.moves.push(edge);
      }
      edge.count += src.count;
      edge.results.wins += src.results.wins;
      edge.results.draws += src.results.draws;
      edge.results.losses += src.results.losses;
      edge.games.push(...src.games);
    }
  }
}

/** Replays `game` from the start position into its own scratch `nodes` (never the tree's real
 * one — see `mergeGameNodes`), adding or incrementing one edge per ply (up to the depth cap) at
 * the node it's played from. Every edge along the way gets this game's own outcome and GameRef —
 * a later position reached only via an opponent's reply still needs to know how games reaching
 * it turned out. Throws RulesError (via `playUci`) on a move it can't legally play; the caller
 * decides what a partial fold means, since scratch `nodes` here is discarded either way. */
function foldGame(nodes: Record<string, TreeNode>, game: ImportedGame, outcomeKey: keyof MoveResults, maxPliesPerSide: number, ref: GameRef): void {
  let pos = positionFromFen(START_FEN);
  const limit = Math.min(game.ucis.length, maxPliesPerSide * 2);
  for (let i = 0; i < limit; i++) {
    const fromEpd = repetitionKey(pos);
    const uci = game.ucis[i]!;
    const played = playUci(pos, uci);
    const toEpd = repetitionKey(played.pos);

    const node = nodeAt(nodes, fromEpd);
    let edge = node.moves.find(m => m.uci === uci);
    if (!edge) {
      edge = { uci, san: played.san, to: toEpd, count: 0, results: emptyResults(), games: [] };
      node.moves.push(edge);
    }
    edge.count += 1;
    edge.results[outcomeKey] += 1;
    edge.games.push(ref);
    nodeAt(nodes, toEpd);

    pos = played.pos;
  }
}

/**
 * Folds `games` into a GamesTree from `username`'s side of `color`. A game is skipped (counted
 * in `gamesSkipped`, never thrown) when: `username` didn't play `color` in it (imported games
 * from the other colour, or someone else's game, e.g. a pasted PGN); its result isn't decisive
 * yet; or it has no moves. Everything else is real — no move, count, or result here is anything
 * but a direct fold of the games handed in (A1: nothing here calls an engine or invents a
 * number).
 */
export function buildGamesTree(games: ImportedGame[], username: string, color: Color, opts: BuildGamesTreeOpts = {}): GamesTree {
  const maxPliesPerSide = opts.maxPliesPerSide ?? DEFAULT_MAX_PLIES_PER_SIDE;
  const root = repetitionKey(positionFromFen(START_FEN));
  const nodes: Record<string, TreeNode> = { [root]: { moves: [] } };
  let gamesFolded = 0;
  let gamesSkipped = 0;

  for (const game of games) {
    const playedColor = playedColorFor(game, username);
    const outcomeKey = playedColor === color ? outcomeFor(game.result, color) : undefined;
    if (playedColor !== color || !outcomeKey || game.ucis.length === 0) {
      gamesSkipped += 1;
      continue;
    }
    // This tree only has one root (the standard starting position); a "From Position" game
    // (chess960 starting setups, or a lichess study branch continued as a game) starts
    // somewhere else on the board and can't be folded into it — replaying its ucis from
    // START_FEN would either desync silently or throw partway through. Compared via rules
    // (repetitionKey), not a string compare against the raw FEN, since two equivalent FENs can
    // differ in whitespace/counters. Counted as skipped, same as any other game this tree can't
    // use, never thrown.
    if (repetitionKey(positionFromFen(game.startFen)) !== root) {
      gamesSkipped += 1;
      continue;
    }
    const opponent = color === 'white' ? game.black : game.white;
    // Defence in depth beyond the startFen check above: foldGame replays real moves through
    // playUci, which throws RulesError on anything it can't legally play (a corrupt uci list, a
    // parser edge case this package hasn't seen). One bad game must never blank the whole tree
    // (and, in the UI, the whole route) — count it as skipped and keep folding the rest.
    // Anything that isn't a RulesError (a real bug) still propagates. Folded into a scratch
    // `nodes` first and merged only on success, so a game that throws partway through never
    // leaves partial counts sitting in the tree under a game that was reported as skipped.
    const gameNodes: Record<string, TreeNode> = {};
    try {
      foldGame(gameNodes, game, outcomeKey, maxPliesPerSide, { url: game.url, playedAt: game.playedAt, opponent });
    } catch (err) {
      if (!(err instanceof RulesError)) throw err;
      gamesSkipped += 1;
      continue;
    }
    mergeGameNodes(nodes, gameNodes);
    gamesFolded += 1;
  }

  return { username, color, root, nodes, maxPliesPerSide, gamesFolded, gamesSkipped };
}

/** The moves recorded at `epd`, or an empty array for a node the tree never reached (e.g. an
 * EPD from a different tree, or one beyond the depth cap). */
export function childrenOf(tree: GamesTree, epd: string): TreeMove[] {
  return tree.nodes[epd]?.moves ?? [];
}

/** `moves`, most-played first (ties keep their original order — Array.prototype.sort is
 * stable). The natural default ordering for a diagnostic tree: "what did I actually play most"
 * before "what's objectively best" (that's the builder's MultiPV panel, not this tree). */
export function mostPlayed(moves: TreeMove[]): TreeMove[] {
  return [...moves].sort((a, b) => b.count - a.count);
}

/** Points-per-game (1 for a win, 0.5 for a draw, 0 for a loss) for one edge, from the tree's own
 * colour's side. 0 for an edge with no games, rather than NaN — `count` is always > 0 for any
 * edge actually in a tree, but a caller building its own TreeMove (e.g. a test fixture) could
 * still hand in count 0. */
export function moveScore(move: TreeMove): number {
  if (move.count === 0) return 0;
  return (move.results.wins + move.results.draws * 0.5) / move.count;
}

/** The full FEN for a node's EPD, for handing to `@human-chess/board`'s `Board`. Same trick as
 * repertoire.ts's `fenAt`: `repetitionKey` drops the halfmove/fullmove counters, and chessops'
 * FEN parser defaults them back in, so this round-trips to a legal position with counters reset
 * rather than the game's real ones — fine, since nothing here displays or relies on them. */
export function fenAt(epd: string): string {
  return fenOf(positionFromFen(epd));
}
