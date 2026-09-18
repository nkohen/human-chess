# Openings builder and trainer — interview notes

Source: user interview, 2026-09-16. One question per turn. Landscape references:
docs/research/2026-09-15-commercial-landscape.md (Chessable, Chess Position Trainer,
Chessbook, Bookup); open-source references: chessdriller (no license), Listudy (AGPL).

## Building a repertoire
All of these are valid inputs:
- by hand on a board;
- import from a lichess study or PGN;
- suggested from the opening explorer or an engine;
- generated from heuristics by the openings heuristic finder;
- an **interactive "what if" process**: the user builds moves while the app asks "what if"
  and supplies likely opponent replies (explorer frequencies at the user's rating band, or
  Maia, are the grounded sources of "likely").

In the interactive setting the user has a **multi-line engine** (Stockfish MultiPV or
equivalent) on screen: give them as many resources as possible when choosing moves.

## Design notes
The user can attach **design decisions and notes** to the repertoire as they build. These
notes are data: they can be analysed, given feedback on (the "state your reasoning, app checks
it" loop again), and fed to the heuristic finder.

## Structure
- An **opening = one tree for one colour**. A system playable by both colours has two trees
  linked by name.
- A repertoire may hold multiple "conflicting" openings. **Merging two openings at a shared
  position is the user's decision**, per position; they can stay separate.
- **Within one opening**, transpositions default to a **single position** (position-graph
  model, as in Chess Position Trainer), because most heuristics prefer the compact form. The
  user may still choose to keep two paths to the same position distinct.
- Implication: the storage model is a graph of positions (keyed by FEN or Zobrist) with edges
  as moves, plus per-opening "split" markers where the user overrides merging. A plain PGN
  tree is an export/import format, not the model.

## Training sessions
All of these are wanted as options:
- drill the whole repertoire;
- drill one opening or one line;
- a spaced-repetition queue that picks positions for you;
- opponent moves taken from the repertoire only, **or** weighted by what real opponents at
  the user's rating actually play (lichess explorer at the rating band; Maia as alternative).

## Deviation handling in drill mode
- The mode explicitly called **drill stops on a wrong move**.
- Two scopes: drill one specific opening, or drill several openings up to the whole
  repertoire. In the multi-opening scope, **any move that keeps the user inside one of the
  selected openings is allowed**, so a move that is wrong for opening A but right for opening
  B is accepted when both are selected.
- Implication: "wrong" is evaluated against the union of the selected position graphs, and
  the drill has to track which opening(s) the current path still belongs to.

## Tools the user actually uses
- **openingtree.com** (open source, GPL-3.0, surveyed): the user uses it heavily to diagnose
  opening weaknesses from their own games. Its consolidated opening tree with per-move results
  across lichess and chess.com games is a reference for the diagnostic side of this tool.
- **Aimchess opening trainer** (formerly used often): plays probabilistically likely opponent
  moves at the user's level; the user believes the probabilities came from a database. That is
  the "weighted by real opponents at your rating" option above; lichess explorer per rating
  band is the grounded source.

## Priority for version one (user, 2026-09-16)
1. **Interactive building** with a multi-line engine on screen. Heuristic help is a maybe,
   possibly a follow-up.
2. **Analysis through an opening tree** (openingtree-style, over the user's own games).
3. **Practice**: drilling, and playing the first few moves against likely opponent replies as
   Aimchess did. Both informed by broad statistics (explorer) and by the user's own opening
   tree of played games.
Later: study/PGN import, explorer/engine suggestions as a first-class input, heuristic
generation.

## Reuse directive
openingtree (github.com/openingtree/openingtree, GPL-3.0 verified from LICENSE 2026-09-15) is
open source and the user wants to **take what we can from it** (2026-09-16): the played-games
opening tree with per-move results, and its no-copy-paste import of lichess and chess.com
games. GPL-3.0 is compatible with human-chess's AGPL-3.0; obligations are attribution and
keeping the copied code's license notices. It is React/JavaScript, which fits the TypeScript
stack. Before any of its code lands, the specific files and what they depend on go into
memory/reuse-library.md.

## Status
Interview closed 2026-09-16; the user may add more later.

**User feedback on the first slice (2026-09-16), built the same day:** search depth at least 20,
and configurable — now default 20, range 6..30, persisted per browser, with the engine's
intermediate lines streamed while the search runs (new `onProgress` on `analyse`). A button to
suggest opponent moves on the opponent's turn — implemented as "Add these N opponent replies to
the tree" over the MultiPV first moves, because the lichess explorer (the interview's source of
"likely") now answers 401 without a lichess login (see memory/reuse-library.md). Built the same
day once the user said yes to OAuth: an explorer panel under the engine lines on the opponent's
turn (`ExplorerPanel.tsx`), logged out it shows a login prompt; logged in it lists each reply's
share with win/draw/loss bars, a rating band (persisted; default 1600–2000, lichess's documented
buckets) and "Add replies played ≥ 5%" — the 5% threshold and the band default are first guesses
the user has not weighed in on. Speeds fixed to blitz+rapid+classical. Explorer responses cached
7 days per position/band through `packages/lichess`.

**Built 2026-09-17: multi-opening drill.** Drill mode now takes a scope — this opening, several
(checkbox list of same-colour openings), or all of the current colour — picked in
`OpeningsBuilder.tsx` and persisted as the last scope choice (not the checkbox picks, which are a
fresh decision each session). `drill.ts` (pure, unit-tested) implements the union rule: a move
wrong for one selected opening is accepted whenever another selected opening still calls it
right, evaluated against the union of the selected position graphs; an opening silently drops out
of the "still live" set the moment the path leaves its own graph, and only a move absent from
every live opening stops the drill. `DrillView.tsx` shows which openings are still live as a
muted line and names the accepted openings next to each move in the wrong-move message when more
than one is in scope. Still not built: the SRS queue that picks positions instead of a fixed
scope, and weighting opponent replies by real-opponent frequency instead of uniform random.
**Built 2026-09-17: opening tree over own games (priority 2).** New package
`packages/opening-tree` folds `ImportedGame[]` into a position-graph tree from a given
username+colour's perspective (EPD-keyed via `repetitionKey`, so transpositions merge); each
node's outgoing edges carry a move count, W/D/L from the tracked player's own side, and
traceable game refs (url, playedAt, opponent). Games are replayed with `playUci`
(`@human-chess/rules`) and capped at `maxPliesPerSide` (first guess: 20, i.e. 40 plies total,
a parameter); games where the user didn't play that colour, or the result is undecided, are
skipped and counted separately. `mostPlayed`/`moveScore` (points/games) helpers included.
`packages/import` gained `fetchRecentLichessGames` (lichess's `GET
/api/games/user/{username}?max=N` export, one request for up to 300 games) and
`fetchRecentChesscomGames` (walks monthly chess.com archives newest-first, one request per
month, first guess default 100 games / max 300). Both take `fetchImpl` for tests, which use
only fake fetches (no live-site probes; see memory/no-live-lichess-probing.md). UI: a third
"Your games" mode in `subprojects/openings-builder/src/GamesTreeView.tsx`, alongside build and
drill — site/username/colour/count form (reusing `useLastUsername`), a workbench with board,
move list with a W/D/L bar per move, breadcrumb path, and "Add to `<opening>`" when a same
colour opening is selected in the builder, wired to `repertoire.ts`'s `addMove`. Fetched games
are cached in memory per site+username+count for the session, with a "Fetch again" button.

Not built: openingtree.com's own code was deliberately not reused here (explicit instruction
for this slice, distinct from the interview's reuse directive above) — this is an independent
implementation. No cross-site consolidation: lichess and chess.com games are loaded into
separate trees per Load, not merged into one combined tree. No merge with the existing
explorer statistics (`ExplorerPanel`'s lichess rating-band data) — the two stay side by side,
not combined into one display.

**Built 2026-09-17: openingtree-style analysis (replaces the per-load "Your games" slice
above).** "Your games" now persists synced games instead of a one-shot per-load fetch: new
`@human-chess/store` (`openGamesStore<StoredImportedGame>()`, IndexedDB with an in-memory
fallback) holds every linked lichess/chess.com account's games, kept current by `packages/
import`'s resumable `syncSourceGames`. `SourcesPanel.tsx` is the accounts manager — add a
site+username (sync starts immediately; there's no separate "unsynced draft" state, since
`GamesStore.listSources()` only returns accounts that have actually synced), Sync/Cancel per
row (one sync at a time, `AbortController`-cancellable, no auto-retry on failure per A1), Remove
(clears the account's stored games), and a persisted "max games per sync" (first guess 2000,
range 100–5000). `GamesTreeView.tsx` loads every linked account's games and folds them with
`@human-chess/opening-tree`'s `buildTree` (not the old `buildGamesTree`), giving transposition
merging, per-move estimated performance, and last-played dates for free. `FilterBar.tsx` wraps
`GameFilter` (speed, rated, opponent rating/name, date range) in a native `<details>`, plus a
`sourceKeys` axis of my own (filters by *which linked account* a game came from — a different
concept from `GameFilter.sources`, which is host-type; account checkboxes only show once more
than one account is linked). `MoveTree.tsx` is the expandable move-tree table (root first, 20
children shown per node with "Show all N", a "↩" transposition marker), replacing the old flat
move list. `Diagnostics.tsx` surfaces `worstMoves`/`mostLostPositions`/`openingSummary` (a
persisted "minimum games" threshold, first guess 5) with a "Show" button that reconstructs a
navigable path from each entry's SAN line and jumps the board and move-tree there. "Add to
`<opening>`" is unchanged (`GamesTreeTarget.addLine`, now moved to `treeHelpers.ts` to avoid an
import cycle with `MoveTree.tsx`/`Diagnostics.tsx`). Filter state, colour and min-games persist
per browser (`human-chess.openings.gamesTree.filter.v1` and siblings). Own decisions, not asked
of the user: the `sourceKeys` account-filter axis described above; "Add" immediately syncs
rather than staging a draft account; no per-source colour coding in the tree or move list; no
merge with `ExplorerPanel`'s lichess rating-band data (still side by side, unchanged from the
prior slice). Tests are pure-function only (`treeHelpers.test.ts`) — the workspace has no jsdom
environment configured (`vitest.config.ts`), so no React component tests were added for the new
screen; `npx pnpm@10 check` (1081 tests) and `SCREENSHOTS_PORT=5199 node scripts/
screenshots.mjs openings` both pass clean, and the empty-store state (no linked accounts) was
separately verified by driving Playwright into "Your games" mode directly, since the shared
screenshot harness only visits the default (Build) mode for this route.

**Code-review fixes, same day:** a "From Position" game (chess960 setups, a lichess study
continued as a game) was crashing the whole route — `buildGamesTree` now compares each game's
own start position against the tree's root via `repetitionKey` and skips a mismatch rather than
folding its moves from the standard start; a fold that still throws (any other RulesError) is
now caught per game and counted as skipped too, never blanking the tree. `addMove` on an
opening now throws on an unknown `fromEpd` instead of silently creating an orphan node (matching
its own doc comment); "Add to `<opening>`" now hands the target opening a whole line of ucis
(`GamesTreeTarget.addLine`) that OpeningsBuilder folds from the opening's own root, since a
games-tree EPD is not guaranteed to be a node the target opening has ever reached. A malformed
game inside a multi-game fetch (lichess's export, one chess.com month) is now skipped
individually rather than discarding every other game in the same batch — `fetchRecentLichessGames`/
`fetchRecentChesscomGames` return `{ games, skipped }` so "folded N of M" stays honest about games
that never parsed at all, not just ones the tree itself excluded. `MAX_RECENT_ARCHIVE_MONTHS`
(chess.com) lowered from 36 to 12 (still a first guess) since each month is its own serialized
request. The games-tree's tree is now built from the username captured at load time, not the
live username input, so editing the field after a load no longer rebuilds against a half-typed
name.

**Code-review fixes, round 2 (same day):** `MoveTree.tsx`'s `expanded`/`showAll` state and
`expandRequest` application are now keyed by *path* (`treeHelpers.pathKey`, unit-tested) rather
than by the EPD a path reaches — a real game can cycle back to an earlier position (e.g.
`1.Nf3 Nf6 2.Ng1 Ng8` returns to the start EPD), and the old EPD keying made the recursive row
renderer re-enter that subtree forever, hanging the tab; `MoveTreeRows` also now threads an
`ancestors` set of EPDs down the render path so a cycle is caught structurally and rendered as a
terminal row (a "↩ repeats an earlier position" marker, no expand control) rather than followed.
`SourcesPanel.tsx` now shows a `pending` row (busy Status, Cancel, and any error) for the account
just submitted via "Add & sync" until the store actually lists it — previously a first sync that
failed before writing any game (e.g. a 404 "no such lichess user") had no row to render its error
in and the failure just vanished; a leftover error from an earlier failed add, once superseded by
a new one, still shows under the add form rather than being dropped. `GamesTreeView.tsx` and
`SourcesPanel.tsx` both now catch their store calls (`listGames`, the initial `listSources`,
`clearSource().then(refresh)`) into a `loadError` state rendered as `<Status kind="error">`
instead of leaving an unhandled rejection; a persisted `sourceKeys` naming an account that's
since been removed no longer locks the tree onto an empty, unsatisfiable "0 of 0 games match"
(stale keys are dropped before the "empty = all" rule applies), and the Accounts filter fieldset
shows whenever any `sourceKeys` are set, not just when more than one account is currently linked.
Minor cleanups: `Diagnostics.tsx`'s "Show" path reconstruction now calls the existing, tested
`pathFromSanLine` helper instead of re-implementing the walk, and its two "Show" buttons use the
`Button` primitive; the move-tree's expand buttons carry `aria-label`; "Linked accounts" is now a
`<details>` (open with zero accounts, closed as soon as one exists — including right after the
first sync — unless the user toggled it by hand) so the move tree gets the vertical room; the
Colour picker is a plain field, not a panel, for the same reason. The table is four columns at
every width (coordinator, from the review's screenshots, 2026-09-17): "Last played" was dropped as
a column (a fifth column clipped Perf. inside the 24rem aside at every desktop width) and shows
instead as each row's tooltip and as a line in "Games with this move"; the per-level indent is a
CSS variable capped at three levels (0.75rem each, 0.5rem on phones) since a real line is 10+
plies deep and an unbounded indent cannot fit any column; the W/D/L bar is 3rem (2.5rem on
phones) inline with its percentage; the performance column is headed "Est. perf." with the
formula in its tooltip. Measured after the change with a faked 8-game lichess export: the tree
table's scroll width equals its client width at 1280×800 and on iPhone 13 down to depth 4.

**Reload survival (2026-09-18).** Every screen restores where it was after a page reload:
`subprojects/openings-builder/src/persistence.ts` holds the snapshot shapes and parsers (keys
`human-chess.openings.{builderState,buildPath,drillState,gamesPath,moveTreeExpanded,
moveTreeShowAll}.v1`) for the selected opening, mode, several-openings picks and new-opening
draft; the builder path (UCIs from the opening root); the drill trail, status and expected move;
the games-tree path; and MoveTree's expanded/show-all sets. Paths are UCI lists rebuilt through
the rules library; a parse failure drops the whole snapshot. Render tests
(`OpeningsBuilder.render.test.ts`, `MoveTree.render.test.ts`, jsdom) seed storage, mount, assert.
Rule and per-tool table: docs/design/2026-09-18-reload-survival.md.

**Built 2026-09-18: own-games stats inside Build mode (user request: "add opening-tree
functionality to the opening builder"; asked which shape, the user chose merging into the Build
view over extending the separate mode).** BuilderView's aside now has a "Your games" panel
between "Engine lines" and "Lichess explorer", shown on both turns: the node summary ("N of your
games reached this position · W/D/L" from the tracked player's side), then one row per own-game
move in count order — SAN, count, own-side W/D/L bar, score %, last played — with "Add" (user's
turn: adds and moves along it via `playAndAdd`; opponent's turn: `addReplies`, no navigation), a
check mark plus "Go" for moves already in the repertoire, and a "not in repertoire" badge on the
user's turn for a move they played that the repertoire lacks (pure set membership against
`childrenOf(opening, currentEpd)`; that badge is the point: where own games leave the line).
The tree is built with the *opening's* colour and the persisted Your-games filter (read once at
mount), so the two modes agree; BuilderView lists linked accounts once on mount
(`getGamesStore().listSources()`) and never syncs. The sources → selected sources (persisted
`sourceKeys`, removed accounts dropped) → games → GameFilter → `buildTree` chain moved into
`ownGamesTree.ts` (`useOwnGamesTree`, `rowsForPosition`, unit-tested) and GamesTreeView uses the
same hook; `WdlBar.tsx` is the one W/D/L bar (MoveTree, Diagnostics, the panel). Panel state
precedence: load error → loading → no accounts → content. Files: `OwnGamesPanel.tsx`,
`ownGamesTree.ts` (+test), `WdlBar.tsx`, `BuilderView.render.test.ts` (jsdom, seeds the
in-memory games store). Not built: editing filters from Build mode (change them in Your games
mode), a link that jumps to Your games mode, per-source colouring, merging with the lichess
explorer numbers (still side by side).

## Open questions (not yet asked)
- How the user's played games are pulled in: answered 2026-09-17 — `packages/opening-tree` folds
  `fetchRecentLichessGames`/`fetchRecentChesscomGames` results, own implementation rather than
  openingtree's importer (see "Code-review fixes" above).
- Whether repertoires are shared between users.
- Other (non-drill) modes' deviation handling, e.g. free play against the repertoire.
- SRS scheduling scheme (Chessable's 8 fixed levels is the only documented one; SM-2/FSRS are
  the general-purpose options).
