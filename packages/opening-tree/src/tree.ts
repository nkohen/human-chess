// The played-games opening tree (v2, 2026-09-17): folds a set of already-imported games (from
// @human-chess/import) into a position graph from one player's own perspective and one colour
// — "which of my moves (and which opponent replies) have I actually faced, and how did those
// games turn out" (memory/subprojects/openings-builder-trainer.md, priority 2). Design reference
// is openingtree.com (GPL-3.0): EPD-keyed nodes so transpositions merge, per-move games/W-D-L,
// per-node opponent-rating and performance stats. We port the IDEA, not the code — this is a
// small, independent implementation (memory/reuse-library.md doesn't need an entry for it).
//
// Pure and React-free. The only chess dependency is @human-chess/rules (playUci, repetitionKey
// — nothing here judges legality, re-derives notation, or invents a result; A1/V3).
//
// `buildTree`/`GamesTree`/`TreeNode`/`TreeMove` below are the v2 API. `buildGamesTree`,
// `childrenOf`, `mostPlayed`, `moveScore`, `fenAt`, `DEFAULT_MAX_PLIES_PER_SIDE` are the v1
// exports kept working with their original signatures — the only consumer,
// subprojects/openings-builder/src/GamesTreeView.tsx, is untouched by this rebuild and must
// keep compiling exactly as it is. See this package's memory/shared-layer.md entry for the one
// deliberate spec deviation that required (TreeMove.games stays GameRef[], not number[]).
import { fenOf, playUci, positionFromFen, repetitionKey, RulesError, START_FEN, type Color } from '@human-chess/rules';
import type { GameSpeed, ImportedGame } from '@human-chess/import';
import { matchesFilter, type GameFilter } from './filters';

export { START_FEN };

export interface WDL {
  wins: number;
  draws: number;
  losses: number;
}

/** v1 alias — MoveResults and WDL have always had the same shape; GamesTreeView imports the
 * name `MoveResults`. */
export type MoveResults = WDL;

export type Source = 'lichess' | 'chess.com' | 'pgn';

/** Enough to trace one edge's contribution back to the game it came from, without carrying the
 * whole TrackedGame (still less the whole ImportedGame) into every edge. `gameIndex` is the one
 * new field (points into `tree.games`) — everything else is exactly v1's GameRef shape, since
 * GamesTreeView's `GameRefList` renders `.url`/`.opponent`/`.playedAt` directly off these. */
export interface GameRef {
  url: string | undefined;
  playedAt: string | undefined;
  opponent: string | undefined;
  /** Index into `GamesTree.games` — the one place this edge's game's opponent rating, speed,
   * rated flag, ECO and opening name live, so an edge doesn't have to duplicate them. */
  gameIndex: number;
}

/** One folded game, deduplicated once per tree rather than once per edge it touches (an edge's
 * `GameRef` just points back here by index). */
export interface TrackedGame {
  index: number;
  url: string | undefined;
  playedAt: string | undefined;
  opponent: string | undefined;
  opponentRating: number | undefined;
  /** From the tracked player's own side — never White/Black literally. */
  result: 'win' | 'draw' | 'loss';
  /** Derived from the game's own URL host (lichess.org / chess.com), not from
   * `ImportedGame.source` — a pasted PGN of a lichess game (source: 'pgn' from the parser, but
   * carrying a lichess.org Site header as its url) should still read as 'lichess' here, since
   * that's where the game is actually verifiable. No URL (or an unrecognised host) is 'pgn'. */
  source: Source;
  speed: GameSpeed | undefined;
  rated: boolean | undefined;
  eco: string | undefined;
  openingName: string | undefined;
}

/** One edge out of a node: the move played, how many (folded) games played it, results, and
 * derived per-move stats — all computed once, at build time, straight off the folded games
 * (A1/V3: nothing here is an engine judgement or a free-form claim). */
export interface TreeMove {
  uci: string;
  san: string;
  /** EPD (repetitionKey) of the resulting position. */
  to: string;
  count: number;
  results: WDL;
  /** Points per game (1 win, 0.5 draw, 0 loss), from the tracked player's side. 0 for count 0. */
  score: number;
  /** FIDE-style linear performance-rating approximation: avg opponent rating + 400 * (wins -
   * losses) / games, computed only over this edge's games that have a known opponent rating
   * (games against an unrated/unknown opponent are excluded from the average AND from the W/L/N
   * used here, so the two stay consistent with each other). A first guess — this specific
   * formula (and openingtree.com's own use of it) isn't verified against anything; a real FIDE
   * performance calculation is nonlinear and this is a common simplification, not FIDE's actual
   * method. Undefined when no game in this edge has an opponent rating. */
  /** An estimate, not a rating — any UI surfacing this must label it "est." (or similar), never
   * present it as a real rating. */
  performance?: number | undefined;
  avgOpponentRating?: number | undefined;
  /** Max `playedAt` over the edge's games (ISO-8601 instants sort lexicographically), or
   * undefined if no contributing game has a known playedAt. */
  lastPlayedAt?: string | undefined;
  games: GameRef[];
}

export interface TreeNode {
  epd: string;
  /** Folded games that reached this position (own colour's games only; the tree has one root
   * colour), each counted once even if the game itself revisits this node via a repeated
   * position. Not the sum of `moves[].count` in general: lower than that sum when a game ends
   * exactly at this node (the last folded ply, or the tree's depth cap) without playing on from
   * it, but also lower when a game reaches this node via two different predecessor edges (a real
   * transposition within one game) — `games` still only counts that game once, while each of the
   * two edges that led here counts it once too. */
  games: number;
  /** This node's own reached-here results, same "from the tracked player's side" convention as
   * every other result in this file. */
  results: WDL;
  /** Sorted by `count` descending (v1's `mostPlayed` behaviour, now baked into node order). */
  moves: TreeMove[];
  /** How many distinct EPDs have an edge landing here — 0 for the root (no incoming edge), 1 for
   * an ordinary node, >1 marks a transposition (this position was reached via more than one
   * predecessor position, i.e. more than one move order). */
  parents: number;
}

export interface GamesTree {
  /** Keyed by EPD (repetitionKey); transpositions across (and within) games land on the same
   * node, same as v1's Record<epd, TreeNode> — a Map now, so lookups (`childrenOf`,
   * `nodeAccums.get`, everything internal to `buildTree`) are O(1) instead of v1's `.find` scans
   * over an array. */
  nodes: Map<string, TreeNode>;
  /** One entry per folded game — the source of truth for opponent rating / speed / rated / ECO
   * / opening name that per-edge stats (`performance`, `openingSummary`, ...) are computed from. */
  games: TrackedGame[];
  /** Games handed in but never folded, broken out by why: didn't match any listed username
   * (`notPlayer`), matched but played the other colour (`wrongColor`), both White and Black
   * headers matched a listed username — two tracked accounts played each other, so there's no
   * single "the player's" side to fold it under (`selfPlay`), no decisive result yet
   * (`undecided`), excluded by `opts.filter` before folding (`filteredOut`), or folding itself
   * couldn't use it — zero moves, a non-standard start position ("From Position" games), or a
   * move `@human-chess/rules` rejects as illegal (`unparsable`). Never silently merged into
   * `games` — a caller showing "N of M games used" needs the full breakdown. */
  skipped: {
    notPlayer: number;
    wrongColor: number;
    selfPlay: number;
    undecided: number;
    unparsable: number;
    filteredOut: number;
  };
  /** EPD (repetitionKey) of the standard starting position. */
  root: string;
  // --- v1 convenience fields, not part of the openingtree.com-derived spec above, kept so
  // GamesTreeView (which reads these directly off the object `buildGamesTree` returns) still
  // compiles unchanged. ---
  color: Color;
  maxPliesPerSide: number;
  /** = `games.length`. */
  gamesFolded: number;
  /** = the sum of every `skipped.*` field. */
  gamesSkipped: number;
}

export interface BuildTreeOpts {
  /** Every account the tracked player is known by. A game counts as "the player's" when the
   * fetcher's own attribution (`ImportedGame.username`/`.playedAs`) names a listed username, OR
   * — when there's no such attribution (a pasted PGN) — its White/Black header matches a listed
   * username case-insensitively. In that header-matching fallback, `site` DOES matter: only
   * players whose `site` matches the game's own site (derived from its URL, same as
   * `TrackedGame.source`) are candidates, so a stranger who happens to share a username on a
   * different site isn't folded in as the tracked player (see `playedColorFor`). A game where
   * both sides match a listed username (two tracked accounts playing each other) is skipped as
   * `skipped.selfPlay`, not folded for either side. */
  players: Array<{ site: 'lichess' | 'chess.com'; username: string }>;
  color: Color;
  filter?: GameFilter | undefined;
  maxPliesPerSide?: number | undefined;
}

/** Plies folded per side, i.e. up to `2 * maxPliesPerSide` total plies per game. Raised from
 * v1's 20 to 30 (still a first guess, still not measured against real repertoire depths — just
 * deep enough to cover more real opening theory while folding thousands of games stays fast;
 * see the perf test in tree.test.ts). */
export const DEFAULT_MAX_PLIES_PER_SIDE = 30;

function emptyWDL(): WDL {
  return { wins: 0, draws: 0, losses: 0 };
}

/** The tracked player's own colour in `game`, `'selfPlay'` when both sides are listed players
 * (see below), or undefined when the game isn't any listed player's.
 *
 * Two matching strategies, in order:
 *
 * 1. Trust the fetcher's own attribution when it's present: `game.username` (the account a
 *    lichess/chess.com fetch was made as) and `game.playedAs` (that fetcher's own
 *    already-computed colour for it). If `game.username` matches a listed player, `playedAs` is
 *    authoritative — it doesn't matter what a same-named opponent's header says.
 * 2. Otherwise (a pasted PGN, or any game with no fetcher-set username) fall back to matching the
 *    White/Black headers against listed usernames directly. This is the fallback that used to
 *    match against every listed player regardless of site, which meant a chess.com game between
 *    a stranger who happens to share a lichess-tracked username and the actual tracked
 *    chess.com account could get folded as a win/loss for the wrong person. Restrict candidates
 *    to players whose `site` equals this game's own site (`sourceFromUrl`) whenever that's
 *    knowable; a header match against an account listed for a *different* site is a coincidence,
 *    not this game's player. When the site can't be determined (`'pgn'`), all listed players are
 *    still candidates, same as before.
 */
function playedColorFor(
  game: ImportedGame,
  players: Array<{ site: 'lichess' | 'chess.com'; username: string }>,
): Color | 'selfPlay' | undefined {
  if (game.username && game.playedAs) {
    const fetchedAs = game.username.toLowerCase();
    if (players.some(p => p.username.toLowerCase() === fetchedAs)) return game.playedAs;
  }

  const gameSource = sourceFromUrl(game.url);
  const candidates = gameSource === 'pgn' ? players : players.filter(p => p.site === gameSource);
  const usernamesLower = candidates.map(p => p.username.toLowerCase());
  const whiteMatches = !!game.white && usernamesLower.includes(game.white.toLowerCase());
  const blackMatches = !!game.black && usernamesLower.includes(game.black.toLowerCase());
  if (whiteMatches && blackMatches) return 'selfPlay';
  if (whiteMatches) return 'white';
  if (blackMatches) return 'black';
  return undefined;
}

/** The tree colour's side's outcome of `result` (a PGN Result header value), or undefined for
 * anything that isn't decisive ('*', missing, or malformed) — such a game can't be attributed a
 * win/draw/loss, so it's skipped (`undecided`) rather than folded with no result to attach. */
function outcomeFor(result: string | undefined, color: Color): keyof WDL | undefined {
  if (result === '1-0') return color === 'white' ? 'wins' : 'losses';
  if (result === '0-1') return color === 'white' ? 'losses' : 'wins';
  if (result === '1/2-1/2') return 'draws';
  return undefined;
}

function outcomeToResult(key: keyof WDL): 'win' | 'draw' | 'loss' {
  return key === 'wins' ? 'win' : key === 'losses' ? 'loss' : 'draw';
}

/** `source` for a TrackedGame, from its URL's host rather than `ImportedGame.source` — see
 * TrackedGame's own comment for why. Any URL that doesn't parse, or whose host isn't
 * lichess.org/chess.com, falls back to 'pgn', same as no URL at all. */
function sourceFromUrl(url: string | undefined): Source {
  if (!url) return 'pgn';
  try {
    const host = new URL(url).host.toLowerCase();
    if (host === 'lichess.org' || host.endsWith('.lichess.org')) return 'lichess';
    if (host === 'chess.com' || host.endsWith('.chess.com')) return 'chess.com';
  } catch {
    // Not a parseable URL — treat like no URL at all.
  }
  return 'pgn';
}

interface EdgeAccum {
  uci: string;
  san: string;
  to: string;
  count: number;
  results: WDL;
  gameRefs: GameRef[];
}

interface NodeAccum {
  epd: string;
  games: number;
  results: WDL;
  /** uci -> edge, so folding thousands of games never does a linear `.find` over a node's
   * moves — the thing v1 did and this rebuild explicitly replaces (task note: "Replace the old
   * linear find scans by Map lookups"). */
  moveMap: Map<string, EdgeAccum>;
  parents: Set<string>;
}

/** Per-edge stats computed once, after all games are folded, from the edge's own `gameRefs` and
 * the tree's `trackedGames` list (via `GameRef.gameIndex`) — see TreeMove's field comments for
 * what each one means. */
function finalizeEdge(e: EdgeAccum, trackedGames: TrackedGame[]): TreeMove {
  const score = e.count > 0 ? (e.results.wins + e.results.draws * 0.5) / e.count : 0;
  let lastPlayedAt: string | undefined;
  const rated: TrackedGame[] = [];
  for (const ref of e.gameRefs) {
    const tg = trackedGames[ref.gameIndex]!;
    if (tg.playedAt !== undefined && (lastPlayedAt === undefined || tg.playedAt > lastPlayedAt)) lastPlayedAt = tg.playedAt;
    if (tg.opponentRating !== undefined) rated.push(tg);
  }
  let avgOpponentRating: number | undefined;
  let performance: number | undefined;
  if (rated.length > 0) {
    avgOpponentRating = rated.reduce((sum, g) => sum + g.opponentRating!, 0) / rated.length;
    const wins = rated.filter(g => g.result === 'win').length;
    const losses = rated.filter(g => g.result === 'loss').length;
    performance = avgOpponentRating + (400 * (wins - losses)) / rated.length;
  }
  return {
    uci: e.uci,
    san: e.san,
    to: e.to,
    count: e.count,
    results: e.results,
    score,
    performance,
    avgOpponentRating,
    lastPlayedAt,
    games: e.gameRefs,
  };
}

/**
 * Folds `games` into a GamesTree from `opts.color`'s side, tracking any game whose White or
 * Black header matches one of `opts.players`' usernames (case-insensitively; `site` is a label
 * only, see BuildTreeOpts). A game is skipped, never thrown, when: it isn't the tracked player's
 * (`notPlayer`); it's their other colour (`wrongColor`); its result isn't decisive
 * (`undecided`); `opts.filter` excludes it (`filteredOut`); or it can't be folded from the
 * standard start — a non-standard "From Position" game, or a move `playUci` rejects
 * (`unparsable`). Everything folded is a direct fold of the games handed in — no move, count,
 * or stat here is invented (A1).
 */
export function buildTree(games: ImportedGame[], opts: BuildTreeOpts): GamesTree {
  const maxPliesPerSide = opts.maxPliesPerSide ?? DEFAULT_MAX_PLIES_PER_SIDE;
  const root = repetitionKey(positionFromFen(START_FEN));

  const nodeAccums = new Map<string, NodeAccum>();
  function accumAt(epd: string): NodeAccum {
    let n = nodeAccums.get(epd);
    if (!n) {
      n = { epd, games: 0, results: emptyWDL(), moveMap: new Map(), parents: new Set() };
      nodeAccums.set(epd, n);
    }
    return n;
  }
  accumAt(root);

  const trackedGames: TrackedGame[] = [];
  const skipped = { notPlayer: 0, wrongColor: 0, selfPlay: 0, undecided: 0, unparsable: 0, filteredOut: 0 };

  for (const game of games) {
    const playedColor = playedColorFor(game, opts.players);
    if (playedColor === undefined) {
      skipped.notPlayer += 1;
      continue;
    }
    if (playedColor === 'selfPlay') {
      skipped.selfPlay += 1;
      continue;
    }
    if (playedColor !== opts.color) {
      skipped.wrongColor += 1;
      continue;
    }
    if (game.ucis.length === 0) {
      // v1 also skipped these outright (rather than folding a game that reaches only the root) —
      // dropped by accident in the v2 rewrite; restored here.
      skipped.unparsable += 1;
      continue;
    }
    const outcomeKey = outcomeFor(game.result, opts.color);
    if (!outcomeKey) {
      skipped.undecided += 1;
      continue;
    }

    const candidate: TrackedGame = {
      index: trackedGames.length,
      url: game.url,
      playedAt: game.playedAt,
      opponent: opts.color === 'white' ? game.black : game.white,
      opponentRating: opts.color === 'white' ? game.meta?.blackElo : game.meta?.whiteElo,
      result: outcomeToResult(outcomeKey),
      source: sourceFromUrl(game.url),
      speed: game.meta?.speed,
      rated: game.meta?.rated,
      eco: game.meta?.eco,
      openingName: game.meta?.openingName,
    };

    if (opts.filter && !matchesFilter(candidate, opts.filter)) {
      skipped.filteredOut += 1;
      continue;
    }

    // This tree has exactly one root, the standard starting position — a "From Position" game
    // (chess960 setups, a lichess study branch continued as a game) starts somewhere else and
    // can't be folded into it. Compared via rules (repetitionKey), not a raw FEN string compare,
    // since two equivalent FENs can differ in whitespace/counters.
    if (repetitionKey(positionFromFen(game.startFen)) !== root) {
      skipped.unparsable += 1;
      continue;
    }

    // Replay into a scratch list first so a game that throws partway through (playUci rejects a
    // move `@human-chess/rules` can't legally play — a corrupt uci list, a parser edge case)
    // never leaves partial edges in the tree under a game later reported as skipped.
    const scratch: Array<{ fromEpd: string; toEpd: string; uci: string; san: string }> = [];
    try {
      let pos = positionFromFen(START_FEN);
      const limit = Math.min(game.ucis.length, maxPliesPerSide * 2);
      for (let i = 0; i < limit; i++) {
        const fromEpd = repetitionKey(pos);
        const uci = game.ucis[i]!;
        const played = playUci(pos, uci);
        scratch.push({ fromEpd, toEpd: repetitionKey(played.pos), uci, san: played.san });
        pos = played.pos;
      }
    } catch (err) {
      if (!(err instanceof RulesError)) throw err;
      skipped.unparsable += 1;
      continue;
    }

    const gameIndex = trackedGames.length;
    trackedGames.push(candidate);
    const ref: GameRef = { url: candidate.url, playedAt: candidate.playedAt, opponent: candidate.opponent, gameIndex };

    // A game that repeats a position (and so replays the same edge, e.g. "1.Nf3 Nf6 2.Ng1 Ng8
    // 3.Nf3 Nf6" revisits the position after 1.Nf3 and replays that exact edge a second time)
    // must still only count once in that node's `games` and that edge's `count` — otherwise a
    // single game folds in as if it were several. `seenNodes`/`seenEdges` are scoped to THIS
    // game only (fresh per iteration) and gate every bump below to a node/edge's first visit
    // *within this game*; a genuine transposition — the same position reached by two DIFFERENT
    // games, or via two different predecessor edges — is unaffected, since each game gets its
    // own fresh Sets. Root is pre-seeded as already-seen (it's visited exactly once, trivially,
    // at the very start of every game) so a game that loops all the way back to the starting
    // position doesn't bump it a second time via the edge-target path below.
    //
    // Consequence: `node.games` equals the sum of its incoming edges' `count` for an ordinary
    // node, but NOT when a game reaches that node via two different predecessor edges (a real
    // transposition) — then `node.games` (one bump per game) is less than the sum of per-edge
    // counts (one bump per distinct edge that reached it). That's expected, not a bug.
    const seenNodes = new Set<string>([root]);
    const seenEdges = new Set<string>();

    const rootAccum = accumAt(root);
    rootAccum.games += 1;
    rootAccum.results[outcomeKey] += 1;

    for (const edge of scratch) {
      const edgeKey = `${edge.fromEpd} ${edge.uci}`;
      const fromAccum = accumAt(edge.fromEpd);
      let e = fromAccum.moveMap.get(edge.uci);
      if (!e) {
        e = { uci: edge.uci, san: edge.san, to: edge.toEpd, count: 0, results: emptyWDL(), gameRefs: [] };
        fromAccum.moveMap.set(edge.uci, e);
      }
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        e.count += 1;
        e.results[outcomeKey] += 1;
        e.gameRefs.push(ref);
      }

      if (!seenNodes.has(edge.toEpd)) {
        seenNodes.add(edge.toEpd);
        const toAccum = accumAt(edge.toEpd);
        toAccum.games += 1;
        toAccum.results[outcomeKey] += 1;
        toAccum.parents.add(edge.fromEpd);
      }
    }
  }

  const nodes = new Map<string, TreeNode>();
  for (const accum of nodeAccums.values()) {
    const moves = [...accum.moveMap.values()].map(e => finalizeEdge(e, trackedGames)).sort((a, b) => b.count - a.count);
    nodes.set(accum.epd, { epd: accum.epd, games: accum.games, results: accum.results, moves, parents: accum.parents.size });
  }

  const gamesSkipped =
    skipped.notPlayer + skipped.wrongColor + skipped.selfPlay + skipped.undecided + skipped.unparsable + skipped.filteredOut;

  return {
    nodes,
    games: trackedGames,
    skipped,
    root,
    color: opts.color,
    maxPliesPerSide,
    gamesFolded: trackedGames.length,
    gamesSkipped,
  };
}

/** The moves recorded at `epd`, or `[]` for a node the tree never reached. Already sorted by
 * count (TreeNode.moves' own invariant), so this no longer needs v1's `.find`-style scan. */
export function childrenOf(tree: GamesTree, epd: string): TreeMove[] {
  return tree.nodes.get(epd)?.moves ?? [];
}

/** `moves`, most-played first (stable sort). Node.moves is already in this order at build time;
 * kept as its own function since GamesTreeView (and any future caller) applies it to an
 * already-fetched `TreeMove[]`, not just a node's own list. */
export function mostPlayed(moves: TreeMove[]): TreeMove[] {
  return [...moves].sort((a, b) => b.count - a.count);
}

/** Points-per-game for one edge, recomputed from `results`/`count` rather than trusting a
 * `.score` field — kept pure so a hand-built TreeMove literal (tests, or a future caller) works
 * without needing every derived field filled in. 0 for `count` 0, never NaN. */
export function moveScore(move: TreeMove): number {
  if (move.count === 0) return 0;
  return (move.results.wins + move.results.draws * 0.5) / move.count;
}

/** The full FEN for an EPD, for handing to `@human-chess/board`'s `Board`. `repetitionKey` drops
 * the halfmove/fullmove counters; chessops' FEN parser defaults them back in, so this round-trips
 * to a legal position with counters reset rather than the game's real ones — fine, nothing here
 * displays or relies on them. Single-arg, not `fenAt(tree, epd)` — deliberate: an EPD alone fully
 * determines its FEN, the tree adds nothing, and GamesTreeView calls this with one argument
 * (`fenAt(tree.root)`, `fenAt(currentEpd)`); adding an unused required `tree` param would break
 * it for no benefit. */
export function fenAt(epd: string): string {
  return fenOf(positionFromFen(epd));
}

interface CameFromStep {
  from: string;
  move: TreeMove;
}

/** One breadth-first walk from `tree.root`, visiting each node's children in `mostPlayed` order
 * (so a node with more than one unvisited child explores — and records as the route to — the
 * more-played one first), building a `toEpd -> {from, move}` map for every node the walk
 * reaches. The shared work behind `lineTo` and diagnostics.ts's `worstMoves`/`mostLostPositions`:
 * those each need a "most-played line" for many different EPDs out of one tree, and calling
 * `lineTo` per entry reran this same whole-tree BFS once per entry. Building it once here and
 * reading it many times via `lineFromCameFrom` is the same result at O(nodes) total instead of
 * O(nodes * entries). */
function buildCameFrom(tree: GamesTree): Map<string, CameFromStep> {
  const cameFrom = new Map<string, CameFromStep>();
  const visited = new Set<string>([tree.root]);
  const queue: string[] = [tree.root];
  let qi = 0;
  while (qi < queue.length) {
    const current = queue[qi++]!;
    for (const move of mostPlayed(childrenOf(tree, current))) {
      if (visited.has(move.to)) continue;
      visited.add(move.to);
      cameFrom.set(move.to, { from: current, move });
      queue.push(move.to);
    }
  }
  return cameFrom;
}

/** SAN moves from `root` to `epd`, read back out of a `buildCameFrom` map. `[]` for `root` itself
 * or an EPD the walk never reached (no node for it, or unreachable via `mostPlayed` children —
 * shouldn't happen for a real GamesTree node, but never throws either way). */
function lineFromCameFrom(cameFrom: Map<string, CameFromStep>, root: string, epd: string): string[] {
  if (epd === root) return [];
  const sans: string[] = [];
  let cur = epd;
  while (cur !== root) {
    const step = cameFrom.get(cur);
    if (!step) return [];
    sans.push(step.move.san);
    cur = step.from;
  }
  return sans.reverse();
}

/**
 * SAN moves from `tree.root` to `epd`, along a "most-played" path: a breadth-first walk from the
 * root that visits each node's children in `mostPlayed` order, so when a node has more than one
 * unvisited child the more-played one is explored (and recorded as the route) first. This isn't
 * a global optimum — it doesn't maximise the product of counts along the whole path, just makes
 * a locally-greedy choice at each branch — but it's enough for the diagnostic display this is
 * for (`worstMoves`, `mostLostPositions` line previews — which, needing this for many EPDs out of
 * the same tree, build and read the same map directly rather than calling this per entry).
 * Returns `[]` for `tree.root` itself, or an EPD the tree has no node for.
 */
export function lineTo(tree: GamesTree, epd: string): string[] {
  if (!tree.nodes.has(epd) && epd !== tree.root) return [];
  return lineFromCameFrom(buildCameFrom(tree), tree.root, epd);
}

// Exposed for diagnostics.ts's batch use (build once, read many times), not part of the public
// index.ts surface.
export { buildCameFrom, lineFromCameFrom };

// --- v1 compatibility surface ---------------------------------------------------------------

export interface BuildGamesTreeOpts {
  maxPliesPerSide?: number | undefined;
}

/**
 * v1's three-positional-arg entry point (one username, one colour), kept exactly as
 * GamesTreeView calls it — a thin wrapper over `buildTree` with a single-element `players`.
 * `site` here is a placeholder ('lichess', arbitrarily) rather than a real caller-supplied value.
 * That's harmless for any game with fetcher-set `username`/`playedAs` (real lichess/chess.com
 * fetches always have it — buildTree's site check only applies to its no-attribution fallback,
 * see BuildTreeOpts), but a pasted-PGN game with no such attribution and a chess.com URL would
 * fail the site-restricted fallback against this placeholder. GamesTreeView doesn't hit that
 * case today (it only calls this with already-fetched games); a future caller that does should
 * use `buildTree` directly with a real `players` list instead.
 */
export function buildGamesTree(games: ImportedGame[], username: string, color: Color, opts: BuildGamesTreeOpts = {}): GamesTree {
  return buildTree(games, { players: [{ site: 'lichess', username }], color, maxPliesPerSide: opts.maxPliesPerSide });
}
