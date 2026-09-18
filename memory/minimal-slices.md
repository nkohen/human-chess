# Minimal slices — one per subproject, for early feedback (user direction, 2026-09-16)

The user wants a super-minimal version of every subproject that admits one, before effort
goes deep anywhere, so they can give feedback early. "Minimal" here = the smallest thing that
shows the core loop end to end with real engine/board output, no polish, no accounts, no
multiplayer. Each row says what the slice is and what shared work it forces. Order is by cost.

| # | Subproject | Minimal slice | Forces |
|---|---|---|---|
| 1 | Endgames intro | done 2026-09-16: four rungs vs full-strength engine | — |
| 2 | Guess the eval | done 2026-09-16: engine self-play position, slider guess, band score, reveal eval + top line, endless | position generator in `positions`; SAN line helper in `rules` |
| 3 | Opening training game | done 2026-09-16 (`#/opening-game`): play 12 or 20 moves vs engine from move one, engine evaluates the end, draw band verdict | a shared "play a game vs opponent" hook lifted out of endgames-intro |
| 4 | Bot-rating test | done 2026-09-16 (`#/bot-rating`): play vs engine at a chosen UCI_Elo from move one; win → offer the next level; games kept in localStorage with provenance | calibrated opponent in `play` (UCI_LimitStrength + UCI_Elo) |
| 5 | Visualization trainer | done 2026-09-16: position shown, a short engine line given in SAN, questions about the unseen end position (check? piece on square? material?) answered from chessops | fact questions in a first `facts` package |
| 6 | Hand and Brain | done 2026-09-16 (`#/hand-and-brain`): hot-seat on one device, two human pairs (per the interview: humans only), brain picks a piece type from buttons, hand moves; no clocks | `legalDestsByRole` in `rules` |
| 7 | Openings builder/trainer | done 2026-09-16 (`#/openings`): build a tree by playing moves with MultiPV suggestions, saved in localStorage; drill: app plays tree replies, wrong move stops | tree model; MultiPV UI |
| 8 | Chessitout variant | done 2026-09-16 (`#/chessitout`): solo: mined imbalanced position, pick a side, play it out vs engine, end eval | position mining by eval band + material imbalance |
| 9 | Memory trainer | done 2026-09-16 (`#/memory`): lichess username → most recent game fetched → reconstruct from move one, "I have no idea" ends, first divergence shown | `import` (lichess API + PGN via chessops) |
| 10 | Game reviewer | done 2026-09-16 (`#/review`): import or paste PGN → per-move eval, diff, classification, best move | `import`, `review` |
| 11 | Puzzles | done 2026-09-16 (`#/puzzles`): puzzles fetched one at a time from the lichess puzzle API (CC0) instead of a dump sample; solution line from the puzzle data | lichess puzzle API |
| — | Group plays chess | no honest minimal without rooms; deferred until `rooms` exists | — |
| — | Openings heuristic finder | no minimal that is not misleading; deferred | — |

Status log: 2026-09-16, one session: slices 2-9 and 11 built by Sonnet workers in worktrees,
merged by the coordinator, reviewed by the code-reviewer agent (slices 2, 5, 6, 7, 9 and the import
layer; findings fixed), committed. Shared work that landed with them: `packages/play` generic game
state + `useEngineGame` (`./react`) + `limitedStrength(elo)`; UCI option restoration and `stop()`
in the engine wrapper; `packages/facts`, `packages/import`, `packages/engine/src/score.ts`
(whitePerspective, formatScore); rules helpers (sanLine, pgn, roles, pieceAt, START_FEN,
fullmove). Slice 10 (game reviewer + `packages/review`) landed last. A CDP browser smoke run of all
routes passed (no exceptions; endgames move + engine reply, guess-the-eval reveal, puzzle fetch
verified). All 11 slices reviewed by the code-reviewer agent and their findings fixed (last batch: restart-in-effect bugs in Chessitout and the bot-rating test, checkmate shown as "mate lost" in the reviewer, review cancellation, import screen lifted into `packages/import/react`). All bands and thresholds (draw band 30 cp, imbalance band 150 cp,
classification cutoffs) are first guesses marked in code for the user to tune. (The imbalance band was retuned 2026-09-17 to 100-350 cp; see "Feedback pass 5" below and memory/subprojects/chessitout-variant.md.)
Follow-up: memory-trainer/src/reconstruction.ts duplicates packages/play game state (no-playerColor mode). (The auto-queen idiom once repeated in six files was replaced 2026-09-17 by the board's promotion picker: `onMove(from, to, promotion?)`.)

Feedback pass 1 (2026-09-16, after the user played guess-the-eval and visualization): nine
comments, all built the same day by three Sonnet workers and reviewed. Shared: `MoveLine` in
packages/board (hover a move in any displayed line → position; adopted in guess-the-eval,
visualization, openings builder, bot-rating test) on `annotateLine` in packages/rules; position
recipes in packages/positions (quiet / sharp / late / imbalanced). Guess-the-eval: turn shown,
band scale with guess and answer markers after the reveal, five positions per round with
GeoGuessr-style points (5000 × exp(−distance/150 cp), first guess), summary. Visualization: the
piece-on square is always one the line touched, material before the line shown, five exercises
per session, hover previews only after the reveal. The user's remaining comments on the other
nine slices are still to come.
Feedback pass 2 (2026-09-16, guess-the-eval only): nine bands with "dominating" at ±500 cp;
MoveLine preview made position-fixed and pointer-transparent (the old absolute preview grew the
page and flickered); primary "Next position" at the top of the reveal; chessground drawing
(right-click circles, right-drag arrows) on by default for every Board, shapes kept across
re-renders and cleared on a FEN change; bar-based results page.
Feedback pass 3 (2026-09-16, chessitout, game reviewer, openings builder, bot-rating): Chessitout
says whose move it is; the import screen's lichess fetch silently dropped every result under
StrictMode's double mount (fixed; note lichess 404s non-browser user agents and rate-limits an IP
for a long time after a burst, so test it with a real browser UA and sparingly); openings builder
searches at depth 20 by default (6..30, persisted) with lines streamed while searching and an
"Add these opponent replies to the tree" button on the opponent's turn (engine-based: the lichess
explorer now needs a login); bot-rating has a board editor for the start position (shared
`BoardEditor`). Reviewer findings on each fixed before commit.
Lichess access (2026-09-16, user: "yes add oauth, and avoid hitting lichess limits"): every lichess
call now goes through `packages/lichess` (one request in flight, a 60 s app-wide cooldown after a
429 persisted across reloads, same-URL dedupe, localStorage cache; puzzle-by-id and explorer
responses cached, "next puzzle" never). OAuth PKCE login (client_id `human-chess`, no
registration, redirect to the app root, token in localStorage ~1 year, no refresh) lived in the
app header until 2026-09-17, when the user asked for the header button to go: the only login
button is now the opening explorer's own (`ExplorerPanel.tsx`), the one place that needs a
session; `App.tsx` still completes the OAuth redirect silently. Verified in a headless browser with lichess's endpoints faked at the network layer, and
the user confirmed the real login works (2026-09-16). Bugs found in that smoke and fixed: the restored
hash after the redirect fired no hashchange (the app stayed on home), and a deduped GET whose
leader was aborted pre-send under StrictMode's double mount rejected its joiner too.
chess.com import (2026-09-17): the throttling/cooldown/cache mechanics in `packages/lichess`'s
fetch.ts/cache.ts were extracted into a generic factory, `packages/site-client`
(`createSiteClient({name, storagePrefix, authHosts?})`), with `packages/lichess` refactored to
be its first instance (same public API, same storage keys, all existing tests unchanged and
green) and `packages/chesscom` added as its second, for chess.com's Published-Data API. Facts
verified 2026-09-17 from chess.com's docs and one live request: `api.chess.com/pub/...` is
read-only, needs no login or key, and answers browser requests directly (CORS-open,
`access-control-allow-origin: *`); chess.com asks API clients to identify themselves via
User-Agent, which a browser cannot set, so a static app simply cannot follow that part of the
policy — noted in code rather than worked around. Policy is one request at a time, and a 429
with no documented cooldown length, so the client honours Retry-After when present, else 60 s,
capped at 10 minutes (matching lichess's own policy). `chesscomArchives` (60 s cache, chess.com's
own `max-age`, so a new month shows up promptly) lists a player's monthly archive URLs
oldest-first; `chesscomMonthlyGames` (60 s for the newest archive, which the caller flags with
`newest: true`; 7 days for older months, which never change; no clock-based month guess, since
chess.com's bucketing timezone is unverified — reviewer, 2026-09-17) returns that month's
games, shape-checked on the three fields used (pgn, rules, end_time). `fetchLatestChesscomGame`
in `packages/import` walks archives newest-first, keeps `rules === 'chess'` games, picks the
greatest `end_time` (first in array order on a tie), rejects a moveless game, and gives up after
12 archive months. Smoke-tested 2026-09-17 in headless Chrome with api.chess.com faked at the
network layer (scratchpad chesscom-smoke.mjs); the real API was hit exactly once, to confirm
CORS. `ImportScreen` (`packages/import/src/react.tsx`) gained a lichess/chess.com site picker,
remembered per `storageKey` alongside the username; the two subprojects' storage-key constants
were renamed from `...lichess-username` to `...import-username` (losing the remembered name
once, accepted).
Feedback pass 4 (2026-09-16, openings builder, game reviewer, Chessitout, all boards): explorer
bars show percentages on hover; "Tree at this position" first in the side column; moves can be
removed from the tree (confirm when continuations go with them); review depth 20 by default;
lichess-style eval chart with a zero line and colour; Chessitout board flips while deciding;
every board (hover previews included) highlights the previous move, each derived from that
screen's own move data (a worker did the sweep; the visualization trainer's start position now
keeps its setup moves for it).

Feedback pass 5 (2026-09-17, Chessitout): the user found the mined positions near-equal (a +0.3
came up) and play capped at 40 plies, confusing. Retuned: the imbalance band is now 100-350 cp
(1 to 3.5 pawns) confirmed at depth 18 with a depth-10 pre-screen ahead of it, self-play mines
deeper (random 8 + engine 18 plies, landing around ply 26), `MAX_ATTEMPTS` raised to 40 with
mining-progress reporting; the 'equal' vote is gone (a real edge is now guaranteed by the band);
the 40-ply cap is gone, replaced by a player-driven "Stop and evaluate" button. A stricter,
positional (not just material) notion of "imbalanced" is on hold until the user supplies
pedagogical positions. Details in memory/subprojects/chessitout-variant.md.

Feedback pass 6 (2026-09-17, game reviewer and memory trainer): a chess.com game review
failed with "no answer to go depth 20 within 65000 ms" on the single-threaded wasm engine and
was slow. Fix (63a6e0f): every position is searched with a per-position time cap alongside the
depth (default 5 s, settable with the depth on the waiting/analysing/failed screens); provenance
shows the depth really reached (A1); progress counts positions and shows a time-left estimate.
Memory trainer: every screen fits the viewport (488ecf3); a game-identity line and a "That's the
whole game" ending (ec9734d) — details in memory/subprojects/memory-trainer.md.

Feedback pass 7 (2026-09-17, positions from the user's games and the header login): the user
sent two zips of screenshots of their own games (chess.com chicachoo123, lichess nkohen). They
became `packages/positions/src/curated.ts` (42f4e96): 50 endgames for endgames-intro's "From your
games" section and 7 middlegames for Chessitout's "From your games" source, each with provenance
(22 + 7 exact from fetched chess.com game records, 28 lichess endgames transcribed and
cross-checked; the site's own displayed eval is never shown as an eval, A1). The middlegames
give the evidence for the on-hold stricter-imbalance criterion — table and proposed rule in
memory/subprojects/chessitout-variant.md, not built until the user agrees. The lichess login
button was removed from the app header on the user's request; the explorer panel keeps its own.

Feedback pass 8 (2026-09-17, design): the user found the app ugly, with primary buttons at the
bottom of the screen. Decided with the user: board left, actions panel right on every board
screen, one pass over every screen. Spec in docs/design/2026-09-17-ui.md; `packages/ui` built
first (0f17c6f), then six Sonnet workers migrated all eleven subprojects plus ImportScreen and
LichessLogin in parallel worktrees; merged, reviewed, and smoke-tested at 1280x800 and 1280x650
(no page or main-region overflow on any route, no console errors, primary controls in the top
third). apps/web/src/styles.css is gone; the app's CSS is `packages/ui` plus a small file per
subproject. Reviewer catches fixed before commit: the new game-reviewer move table numbered moves
by 1-based ply ("2. e5") and its rows were not keyboard-reachable; Field wrapping a
SegmentedControl in a `<label>`; the stacked (<60rem) Workbench could not size its board.
Accepted drifts: "Root" is now "Back to start" in the openings builder; hand-and-brain's duplicate
end-of-game dialog is gone (its text is the status line); placeholder start-position boards show
while a position is being mined. Not built, awaiting the user: a setup screen for hand-and-brain
(no engine opponent or role assignment exists yet).

