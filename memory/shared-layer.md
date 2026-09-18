# Shared layer — cross-cutting pieces surfaced by the subproject interviews

Compiled 2026-09-16 from memory/subprojects/*.md. This is the candidate decomposition the
conventions require before the second subproject starts (A2, R1). Not yet a directory layout;
that is the next design step. Each item lists the subprojects that need it.

| Piece | Needed by | Source / grounding |
|---|---|---|
| Rules and board: chessops (rules), chessground (board), legal-move highlighting | all | chessops GPL-3.0, chessground GPL-3.0 (ledger) |
| Engine service: Stockfish over UCI on the server, stockfish-web in the browser, MultiPV, PV lines, WDL, recorded depth/time on every eval | endgames intro, Chessitout, heuristic finder, openings builder, N-move game, group chess, guess the eval, reviewer, bot test, puzzles, visualization | A1: every shown number traces to a real call |
| Rating-calibrated engine play (UCI_Elo / Skill Level / Maia) with played-out calibration | endgames intro (full strength, max resistance), Chessitout, N-move game, group chess (slightly above players), bot test | V2 played-out verification |
| Tablebase access (lila-tablebase endpoint / Fathom) for max-resistance defence and won/drawn truth | endgames intro, position mining | AGPL service run unmodified, or MIT Fathom |
| Game import, no copy-paste, most recent game first: lichess API, chess.com Published-Data API (both built 2026-09-17), PGN fallback; openingtree's importer is the reuse candidate | memory trainer, openings builder, reviewer, bot test | GPL-3.0 openingtree, user-directed |
| Account layer: primary linked account, rating, user-configurable level, provenance tags on every stored game | reviewer, heuristic finder, bot test, puzzles, matchmaking | user, 2026-09-16 |
| Position store and mining: the user's positions folder, pedagogical pool, criteria to find/generate more (WDL, material class, eval stability) | endgames intro (procedural ladder), Chessitout, guess the eval, visualization | user's folder; A1 |
| "What was happening" fact extraction: board-state facts (attackers, defenders, hanging, structure) + engine comparison, LLM narrates only | memory trainer, Chessitout discussion, reviewer, puzzles, visualization dialogue | V3; chess-coach pattern (Apache-2.0) |
| Findability model: what a player at rating R sees (Maia probabilities, explorer frequency at band) | heuristic finder, reviewer, bot test | A1 |
| Concept library: vocabulary of chess concepts with board-state tests, seeded from literature | heuristic finder, reviewer, puzzles | licensing of literature to be raised first |
| Reasoning check loop: user states reasoning, app checks each claim against board/engine | memory trainer, Chessitout, heuristic finder (user-proposed), visualization dialogue; reviewer deferred | V3 |
| Shared analysis board (multi-user, movable pieces, engine optional/disabled per mode) | Chessitout, group chess (tools off), guess the eval, reviewer | lichess study/analysis as design reference |
| Standard review: move list with classifications, eval graph, analysis board, move-by-move report, what-if moves, lazily computed | N-move game, group chess (+ vote data), bot test, memory trainer seed | reviewer subproject owns it |
| Multiplayer: private rooms first, sealed/plurality votes, per-player clocks, per-game ratings, later lobbies/matchmaking and daily queues | Chessitout, N-move game, group chess, guess the eval PvP, Hand and Brain | lila-ws as architecture reference only (AGPL, not separable); boardgame.io (MIT) candidate |
| Spaced repetition scheduler | openings builder; memory/puzzle decks later | Chessable 8-level table documented; SM-2/FSRS general |
| Opening tree over the user's played games with per-move results | openings builder, bot test data, memory trainer | openingtree reuse |
| Opening explorer statistics by rating band | openings builder, heuristic finder, findability | lichess explorer API / self-hosted lila-openingexplorer (AGPL) |
| Puzzle data (lichess dump) and own-game puzzle generation | puzzles, endgames nudge, visualization | CC0 |

Design stances that apply everywhere (user): scaffolding, not gamification; no invented
numbers; focus on concepts applied in practice rather than comparison to expert play.

## Directory decomposition (2026-09-16, first slice built)

One line per top-level directory, as CLAUDE.md requires. Built: rules, board, engine, play,
positions, facts, import, review, lichess, site-client, chesscom, opening-tree, eleven
subprojects, apps/web. Reserved (named, not created): the rest.

| Directory | Responsibility | Interview pieces it will absorb |
|---|---|---|
| `packages/rules` | rules and notation over chessops; only importer of chessops; `annotateLine`/`formatLine` (SAN + move numbers + FEN per ply, 2026-09-16) | rules/board row; mirroring, repetition keys, promotion detection |
| `packages/board` | chessground as a React component; only importer of chessground; `MoveLine` (numbered SAN line, hover shows the position; `preview={false}` for exercises) used by every subproject that displays a line (user, 2026-09-16); `BoardEditor` (free-mode position setup with a spare-piece palette, first used by the bot-rating test, 2026-09-16) | board; later the shared analysis board's board part |
| `packages/ui` (built 2026-09-17) | the shared look: design tokens, native-control base styles, a handful of primitives, and the two page layouts (`Workbench` for a board screen, `Page` for a setup/import screen) every subproject renders inside; `AppShell` is apps/web's own one full-width header. Depends on react only; the only shared CSS (a subproject keeps at most a small file of what is genuinely its own). `useFitSquare` sizes a board to the largest square that fits, replacing per-subproject copies as they migrate. Spec: docs/design/2026-09-17-ui.md | every screen's look, adopted subproject-by-subproject per that doc's rules |
| `packages/engine` | typed UCI client with provenance on every result; Worker + Node transports | engine service |
| `packages/play` | opponents: maximal resistance now; UCI_Elo / Skill Level / Maia calibration later | rating-calibrated engine play |
| `packages/positions` | curated + mined position pools with validation tests; `curated.ts` (added 2026-09-17: 50 real endgame + 7 real middlegame positions from the user's own games — chess.com chicachoo123 and, for 28 more endgame screenshots, lichess.org nkohen — each tagged `source: 'game-record' \| 'screenshot-transcription'`, `siteEvalShown` kept as provenance only, never displayed as an eval) and `curatedEval.ts` (`evaluateCuratedMidgame`: one real `analyse` call requesting depth 18, reached depth recorded, no band filter) consumed by Chessitout ("From your games" source choice) and endgames-intro ("From your games" section) | position store and mining |
| `packages/tablebase` (reserved) | syzygy truth for won/drawn and max-resistance defence | tablebase access |
| `packages/site-client` | generic one-at-a-time HTTP client factory (extracted 2026-09-17 from `packages/lichess`'s fetch.ts/cache.ts): serial queue, same-URL dedupe, persisted 429 cooldown, localStorage TTL cache; `createSiteClient({name, storagePrefix, authHosts?})` builds one independent instance per site | lichess access, chess.com access |
| `packages/lichess` | the one client for lichess.org HTTP APIs (added 2026-09-16 after the user hit lichess limits and asked for OAuth; its queue/cooldown/cache mechanics moved into `packages/site-client` 2026-09-17, same public API and storage keys): single in-flight request, app-wide 429 cooldown, localStorage response cache, OAuth PKCE login + token attach; `import`, `puzzles` and the openings builder's explorer calls go through it | lichess access |
| `packages/chesscom` (built 2026-09-17) | the one client for chess.com's Published-Data API (api.chess.com): another `packages/site-client` instance, no login; `chesscomArchives`/`chesscomMonthlyGames` typed endpoint helpers with shape validation | chess.com access |
| `packages/import` | lichess fetch, chess.com fetch (walks monthly archives newest-first, added 2026-09-17), or pasted-PGN import into one ImportedGame shape; PGN parsing delegated to `packages/rules` (`parsePgnGame`); provenance tags still to add | game import |
| `packages/store` (reserved) | persistence: accounts, linked ratings, games, repertoires | account layer |
| `packages/facts` (built 2026-09-16) | plain-language board-state facts and questions, each answered by a chessops query (check, piece on square, material by the 1/3/3/5/9 convention); engine comparison still to come | fact extraction, reasoning check |
| `packages/concepts` (reserved) | concept vocabulary with board-state tests | concept library |
| `packages/review` | per-move engine review (eval before/after, loss from the mover's side, classification by first-guess cutoffs, best move) with provenance; report prose, what-if and findability still to come | standard review shape |
| `packages/rooms` (reserved) | rooms, clocks, sealed votes, matchmaking | multiplayer |
| `packages/srs` (reserved) | spaced-repetition scheduler | SRS |
| `packages/opening-tree` (built 2026-09-17; rebuilt to v2 2026-09-17) | folds `ImportedGame[]` into a position-graph tree (`buildTree`) from multiple accounts' one username+colour perspective, keyed by `repetitionKey` (EPD, `Map`-backed, not the v1 `Record`) so transpositions merge; each node carries `parents` (>1 marks a transposition) and each edge carries games/W-D-L/score/performance-rating/avgOpponentRating/lastPlayedAt, traceable to a deduplicated `tree.games: TrackedGame[]`; `filters.ts` (`GameFilter`/`matchesFilter`) and `diagnostics.ts` (`worstMoves`/`mostLostPositions`/`openingSummary`) sit on top; `buildGamesTree`/`childrenOf`/`mostPlayed`/`moveScore`/`fenAt` kept as v1-signature wrappers so GamesTreeView (the only consumer) compiles unchanged; still an own implementation, not a port of openingtree.com's GPL code | opening tree half of the shared-layer row above; explorer stats (the other half) still not built |
| `subprojects/<name>` | one tool each; consumes packages | the 13 subprojects |
| `apps/web` | Vite + React host, hash routes, owns the browser engine instance | — |

Tooling decisions taken by the agent on 2026-09-16 (reversible, raise with the user if they
object): pnpm workspace via `npx pnpm@10` (npm 10.9.2 crashes on modern peer sets; corepack's
pnpm cache was broken), React 19 rather than lichess's snabbdom, Vite, vitest, nmrugg's
`stockfish` npm package (lite single-threaded build, no cross-origin isolation needed) rather
than lila-stockfish-web (needs separate NNUE downloads; its npm metadata says AGPL while its
LICENSE file says GPL).

Browser check (user, 2026-09-17, adopted from ~/dev/NumberGoUp): `scripts/screenshots.mjs` on
Playwright 1.62.0 (Apache-2.0, dev-only). It starts its own Vite, blocks lichess.org and
chess.com at the route layer, screenshots every route at 1280x800, 1280x650 and the iPhone 13
descriptor, and fails on overflow, a primary control below the fold, tap targets under 40px or
console errors; docs/visual-testing.md has the human-eye checklist. Session-scratchpad CDP
scripts are no longer the way to smoke a layout change.

Promotion picker (2026-09-17): `packages/board`'s `Board` now detects a promotion itself
(`isPromotionMove` on the pre-move fen) and shows a lichess-style queen/knight/rook/bishop picker
over the destination square instead of auto-queening; `BoardProps.onMove` is now
`(from, to, promotion?: Role) => void`, called only once a piece is picked (or never, if the
picker is cancelled). All six former auto-queen call sites (play/react.ts, memory-trainer,
hand-and-brain, puzzles, openings-builder's Drill/Builder views) now pass the picked role
through instead of hard-coding `'queen'`.

Built 2026-09-17: opening-tree v2. `buildTree(games, { players, color, filter?,
maxPliesPerSide? })` replaces the v1 single-username fold with multi-account matching (any
listed username, case-insensitively), an optional `GameFilter` applied before folding (so
`tree.skipped.filteredOut` stays honest), and a `Map<epd, TreeNode>` in place of v1's `Record`
(edge lookup during folding is now `Map.get`, not the old `.find` scan, so folding thousands of
games stays fast — tested at 2000). Each node now records `parents` (distinct incoming EPDs;
>1 = transposition) and each edge carries `score`, `avgOpponentRating`, `performance`, and
`lastPlayedAt`, all computed once at build time from a deduplicated `tree.games: TrackedGame[]`
(an edge's `GameRef` just indexes into it). `filters.ts` (`matchesFilter`) and `diagnostics.ts`
(`worstMoves`, `mostLostPositions`, `openingSummary`) sit on top, all pure aggregations over the
already-folded tree (A1/V3 — nothing here calls an engine or free-form-generates a judgement).
First guesses, none measured: `DEFAULT_MAX_PLIES_PER_SIDE` raised 20 → 30; the performance-rating
formula (avg opponent rating + 400·(wins−losses)/games, FIDE-style linear approximation,
computed only over an edge's games with a known opponent rating) is a common simplification,
openingtree.com's own use of it unverified; `lineTo`'s "most-played path" is a greedy
breadth-first choice at each branch, not a global optimum. One deliberate deviation from the
task's literal type spec: `TreeMove.games` stays `GameRef[]` (with a new `gameIndex` into
`tree.games`) rather than becoming a bare `number[]` — GamesTreeView's `GameRefList` component
(unchanged, per the task) destructures `.url`/`.opponent`/`.playedAt` straight off each element,
which a bare index can't satisfy without editing that file. `GamesTree` also carries `color`,
`maxPliesPerSide`, `gamesFolded`, `gamesSkipped` beyond the spec's minimum, for the same reason
(GamesTreeView reads them directly). `fenAt` stays single-argument (`fenAt(epd)`, not
`fenAt(tree, epd)`) since an EPD alone determines its FEN and GamesTreeView calls it with one
argument.

Fixed 2026-09-17 (code review on 1fa4b55, 2 blocking + 8 minor): (1) a game that repeats a
position within itself (e.g. `1.Nf3 Nf6 2.Ng1 Ng8 3.Nf3 Nf6`, back to the start) no longer
double-counts that node/edge — folding now tracks per-game `seenNodes`/`seenEdges` and only bumps
a node's `games`/edge's `count` on that node/edge's first visit within the current game. (2)
`players` matching now prefers the fetcher's own `ImportedGame.username`/`.playedAs` attribution
when present, and its pasted-PGN/no-attribution header-matching fallback is now restricted to
players whose `site` matches the game's own derived source — previously a same-named stranger on
a different site could be folded in as the tracked player. A game where both sides match a
listed username is now its own skip bucket, `skipped.selfPlay`, rather than defaulting to White.
Also restored: a zero-move game is skipped as `unparsable` (dropped by accident in the original
v2 rewrite; v1 had it). `worstMoves`/`mostLostPositions` now build one BFS `cameFrom` map per
call and reuse it for every entry instead of re-running `lineTo`'s whole-tree BFS per entry;
`mostLostPositions`' (and now `worstMoves`') `minGames` is clamped to at least 1 so `minGames: 0`
can't let a 0-games node through into a 0/0 loss-rate comparison.
