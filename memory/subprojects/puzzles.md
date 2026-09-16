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
