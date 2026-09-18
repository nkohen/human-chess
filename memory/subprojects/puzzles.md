# Puzzles — interview notes

Source: user interview, 2026-09-16. Added to the list 2026-09-15. Data: lichess puzzle dump
(CC0; PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl,
OpeningTags, DailyDate).

## What is different from lichess puzzles
Not much in the solving experience itself; it will be pretty similar. The differences:
- **Cross-referencing to the other tools** being built (endgames introduction nudges here,
  memory trainer decks, reviewer, openings via OpeningTags).
- **Explicitly connecting puzzle solutions to the concept library** and to the **thought
  processes that can lead to the solution** (the same "what thought process could have led me
  here" framing as the reviewer).

## Grounding
The solution is the puzzle's engine-verified move sequence from the dump; concept links are
derived from the puzzle's Themes plus board-state checks, and any thought-process text is
narrated from those facts (V3).

## Cross-cutting
"Concept library" is now referenced by puzzles, the reviewer, and the heuristic finder. It
needs a home in the shared layer: a vocabulary of concepts, each with a board-state test where
one exists, seeded from professional literature per the heuristic finder interview.

## Rating
**No puzzle rating** for the player. Puzzle difficulty (from the dump's Rating) still drives
selection.

## Own-game puzzles
A **mode that generates puzzles from the player's own games** (the reviewer finds a missed
tactic or a critical moment; the puzzle is the engine-verified line from that position).
Provenance-tagged like all game-derived data.

## Status
Interview closed 2026-09-16; the user may add more later.

## Open questions (not yet asked)
- Modes: single puzzles, themed sets, timed rush; which for version one?

**User feedback on the first slice (2026-09-16), fixed the same day:** after a mating solution
the solver's own king was highlighted as in check (the board was told the solver was to move;
now it gets the real side to move); puzzle themes are hidden until the puzzle is solved because
they give the motif away.

**Built 2026-09-17 (cross-references to the other tools, this file's own "What is different
from lichess puzzles"):** once a puzzle is settled (solved or revealed by failing), a row of
secondary links next to "Next puzzle": "Practice this against the engine" → `#/bot-rating` with
`fen` (the puzzle's own `startFen` — the position before the first solution move, already exactly
what solving starts from) and `color` (`puzzle.solverColor`); "Review the source game" →
`#/review` with `gameUrl` (only shown when the puzzle record has one — see below); "Memorize this
position" → `#/visualization` with the same `fen` (only sends it; that trainer's own Memorize
mode reading it is future work not built here — `subprojects/visualization-trainer` was
out of scope for this task). All three go through `packages/ui/src/handoff.ts`'s
`navigateWithHandoff`. **`gameUrl`**: `puzzle.ts`'s `ParsedPuzzle` now carries an optional
`gameUrl` built as `https://lichess.org/${game.id}` (first guess: lichess's own game-URL
convention) when the live puzzle-API response's `game.id` is present (it is, in every observed
fixture) — never fabricated when absent. **Opening tags not shown**: this subproject reads the
live `/api/puzzle/{next,daily,id}` endpoints (puzzle.ts's own earlier comment), whose response
has no `OpeningTags`-equivalent field — only lichess's bulk CSV puzzle dump carries that column.
So "show opening tags as plain text" from the task spec has nothing to read; not built, and
noted here rather than silently skipped. The reviewer's `ImportScreen` (`@human-chess/import`)
gained an `initialPgnText`/`notice` pair so a `pgn` hand-off can prefill its paste box directly;
a `gameUrl`-only hand-off (this subproject's own case, since it has no PGN text) instead shows a
link to the source game and asks the user to paste its PGN themselves — no fetch was added.
