# Interview answers vs what is built — audit, 2026-09-17

Scope: the eleven built subprojects, compared against `memory/subprojects/<name>.md` (the
interview answers, source of truth for intent), with `memory/minimal-slices.md`, the interview
files' own feedback notes, `memory/subprojects-overview.md`, `memory/shared-layer.md` and commit
bodies used to decide whether a gap was a recorded decision or not. Read-only audit by four
Sonnet agents, one subproject group each; the coordinator spot-checked the claims marked (v).

Statuses: **recorded cut** = absent and written down somewhere as deferred for the minimal
slice; **unrecorded cut** = absent with no record; **assumed** = the code does something the
interview did not ask for, or does it differently, with no user attribution. Anything the user
asked for in a feedback pass counts as intended and is not listed.

## 1. Dropped on purpose to stay minimal (recorded, nothing to do unless you want it back)

- **Every cross-cutting piece** is reserved and unbuilt: accounts and ratings (`store`), the
  concept library (`concepts`), spaced repetition (`srs`), rooms and multiplayer (`rooms`),
  the played-games opening tree (`opening-tree`), tablebases (`tablebase`). Group chess and the
  openings heuristic finder are deferred whole for the same reason.
- **Endgames intro**: rungs beyond the first four, the animated piece introduction, tablebase
  defence, hints when stuck, drawing positions, the nudge to openings/puzzles, help tracking.
- **Guess the eval**: real-game or curated position sources.
- **Visualization trainer**: best-move and who-is-better questions, the player's own line with
  claims, the correction dialogue, blindfold mode.
- **Hand and Brain**: rooms, clocks, team-role enforcement, a setup screen (awaiting you).
- **Chessitout**: the entire two-player mechanic (blind votes, differing sides play, same-side
  reshow, skip list, discussion board, time control). The solo loop is all that exists, by
  your instruction not to design the variant yet.
- **Opening training game**: human opponents and queue, timing, a chosen or daily starting
  opening, a reviewer-shaped post-game screen, the WDL and chess.com-style verdict schemes.
- **Bot-rating test**: Maia and mixed level settings, the adaptive progression, the "you can
  beat X" statement, feeding games into the reviewer and an opening tree.
- **Openings builder**: study/PGN import, heuristic-generated moves, openingtree code reuse.
- **Memory trainer**: the whole discussion mechanic (reasoning recall checked against the
  engine, opponent-motivation guessing, the better-or-equal judgement) and older games. Note
  that the interview calls the discussion the point of the tool, so this cut is the largest
  distance between built and intended anywhere in the app.
- **Game reviewer**: findability at a rating, the narrative why-you-won/lost report, what-if
  on the board, MultiPV "best few", a level setting, the player stating their own reasoning.

## 2. Possibly unintentional: unrecorded cuts

These interview points have no implementation and no note anywhere that they were deferred.
Most are probably fine to defer, but they should either be built or written down as cut.

| Subproject | Unrecorded cut |
|---|---|
| Openings builder | Priority #2 of the interview: opening-tree analysis over your own played games (v) |
| Openings builder | ~~Drilling several openings with the union-of-graphs acceptance rule~~ Built 2026-09-17: drill scope This opening / Several / All (colour); an opening stays live while its own graph matches every move played; replies drawn from the union |
| Openings builder | Two-colour system linked by name; merge two openings at a position; the "split" override; design notes on a repertoire; spaced-repetition queue; drill replies weighted by real-opponent stats (code comment says "later", no user date) (v) |
| Guess the eval | ~~PvP GeoGuessr mode and its always-timed countdown; optional PvE time limit; "analyse the position after guessing"~~ Built 2026-09-17 as same-device pass-and-play (rooms are still unbuilt): PvP always timed with player 2's limit = min(limit, player 1's time + 10 s) in place of the GeoGuessr countdown; PvE limit none/15/30/60 s; analysis board with top-3 engine lines after the reveal (PvE) or from the results screen (PvP) |
| Visualization trainer | Position sources (puzzles, own games, pedagogical pool); the progression ladder (longer lines, more pieces, obscuration). ~~The timed position-memorizer minigame~~ Built 2026-09-17 as the Memorize mode (study 5/10/20 s, rebuild on an empty board, diff and score over 5 rounds; random or curated source) |
| Puzzles | Cross-references to the other tools; own-game puzzle generation from the reviewer |
| Bot-rating test | Goal 3: showing which suboptimal lines get punished at what rating; repertoire lines as a start position |
| Game reviewer + bot test | "Play from this position" hand-off from the review into the bot-rating test (v). Same for the endgames meta hand-off and visualization to blindfold |

## 3. Possibly unintentional: assumptions and divergences with no user attribution

| Subproject | What the code does | What the interview said |
|---|---|---|
| Puzzles | Fetches from the live lichess puzzle API, anonymous `/next`, no difficulty control (v) | Data source is the CC0 dump; difficulty (Rating) drives selection. The API choice is recorded in minimal-slices but was the agent's, not yours |
| Puzzles | Single puzzle at a time | Mode choice (single, themed, timed) was left open |
| Guess the eval | Flat centipawn bands at every game phase; slider fixed at ±1000 cp, not flagged as a guess (v) | WDL was the candidate basis for phase-invariant bands; the scale was "not yet chosen" |
| Chessitout, opening game | Engine strength is a manual Elo dropdown; opening game defaults to the lowest Elo (v) | "The engine plays at the level of the player" (no player rating exists yet, so this was unbuildable, but the default is an assumption) |
| Opening game | Colour choice white/black/random | Not asked for |
| Bot-rating test | Provenance records live in the subproject's own localStorage | Provenance tagging was meant as a shared account-layer concern |
| Memory trainer | One static "you played X, the game went Y" sentence per divergence | A situational discussion of each divergence |
| Memory trainer, Hand and Brain, puzzles and others | ~~Auto-queen on every promotion, no picker~~ Fixed 2026-09-17: the board shows a queen/knight/rook/bishop picker on every promotion, cancel by clicking elsewhere or Escape; every caller takes the chosen piece | Never discussed; six files repeated the idiom |
| Game reviewer | Movetime cap, default 5 s (1 to 60 s) | Not asked for; added to fix engine timeouts |

## 4. Numbers that are first guesses waiting for you

| Where | Value |
|---|---|
| Game reviewer classification | good < 30 cp, inaccuracy < 100, mistake < 300, else blunder |
| Game reviewer movetime cap | 5 s |
| Opening training game draw band | 30 cp |
| Chessitout imbalance band | 100 to 350 cp, depth 18 (retuned by you 2026-09-17) |
| Guess the eval | points 5000·exp(−d/150); "dominating" band at ±500 cp; slider ±1000 cp; depth 14; 5 rounds |
| Visualization trainer | 5 exercises; 8-ply random setup; fixed line length |
| Openings builder explorer | add threshold 5 %; rating band 1600 to 2000; depth 20 (6 to 30) |
| Engine Elo defaults | opening game: lowest UCI Elo; Chessitout: see `ELO_OPTIONS` in its screen |

## Per-subproject tallies

| Subproject | Implemented | Cut, recorded | Cut, unrecorded | Diverged, user | Diverged/added, assumed |
|---|---|---|---|---|---|
| Endgames intro | 7 | 7 | 0 | 1 | 0 |
| Guess the eval | 3 | 1 | 3 | 1 | 4 |
| Visualization trainer | 3 | 2 | 3 | 0 | 1 |
| Hand and Brain | 4 | 4 | 0 | 0 | 1 |
| Chessitout | 2 | 6 | 0 | 1 | 1 |
| Opening training game | 2 | 5 | 0 | 0 | 3 |
| Bot-rating test | 3 | 4 | 2 | 1 | 1 |
| Openings builder | 6 | 3 | 8 | 1 | 2 |
| Puzzles | 3 | 1 | 2 | 2 | 3 |
| Memory trainer | 6 | 4 | 0 | 4 | 2 |
| Game reviewer | 6 | 7 | 1 | 0 | 2 |

Excluded from grading: points the interview files list under "Open questions (not yet asked)".
