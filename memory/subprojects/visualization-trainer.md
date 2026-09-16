# Visualization trainer — interview notes

Source: user interview, 2026-09-16. One question per turn. Reference: DarkSquares seven-stage
ladder, Chess.com Vision, Chess Position Trainer blindfold mode (landscape doc).

## Goal
**Primary**: visualization skills that transfer to **calculating lines in a real game**, where
you cannot move the pieces without committing. Secondary: training **blindfold chess**.

## Exercise shape
The **current position stays visible** on the board. The player is forced to reason about
**"what if" futures without seeing them**: a line is given (or chosen) and the pieces do not
move; the player must visualize the resulting position and answer from it. This mirrors real
calculation: board in front of you, future in your head.

## What is asked
All of: the best move from the visualized position; a board-state fact about it (hanging,
defended, check, and the like); which side stands better; and the player proposing their own
line with claims about where it ends, which the app checks. Plus **back-and-forth
correction**: the app can push back ("the bishop is not on c4 after that line, it was captured
on move 2 of your line") and the player retries, a short dialogue rather than one-shot grading.

Grounding: the visualized position is computed with chessops from the line; facts are board
queries; "better" and "best move" are engine calls (A1/V3). The dialogue narrates those.

## Sources
All of: puzzles from the lichess dump; the player's own games via the reviewer; the
pedagogical position pool; engine-generated lines from any position.

## Progression
All of: longer lines; more pieces on the board; gradually hiding pieces toward full blindfold
(the DarkSquares obscuration idea, which serves the secondary blindfold goal).

## Extra modes
- A **timed position-memorizer minigame** (show a position, hide it, rebuild it against the
  clock; the Memory Chess / Chess Memory Trainer shape from the landscape doc). Distinct from
  the memory trainer subproject, which is about your own games.
- A **blindfold mode** (the secondary goal made explicit; full blindfold play is the top rung
  of the obscuration ladder).

## Status
Interview closed 2026-09-16; the user may add more later.

## Status
Interview closed 2026-09-16.

**First slice built 2026-09-16** (subprojects/visualization-trainer, hosted at `#/visualization`,
plus the first `packages/facts`): a random legal start position (8 random plies), the engine's
depth-10 line cut to 4 plies shown in SAN under a view-only board, three questions about the
unseen end position answered from chessops via the facts package (is it check; which piece is on
a square; material points by the 1/3/3/5/9 convention), check answers, reveal the end board, tally,
next. Not built: best-move and who-is-better questions (engine-graded), the player's own line with
claims, back-and-forth correction dialogue, coordinate drills, blindfold hand-off, time element.

**User feedback on the first slice (2026-09-16), all addressed in the second pass:**
- Asking what is on a square the line never touched, with the board visible, is silly (→ the
  piece-on square is always one the line touched or changed).
- For the material question, show the balance before the line so the learner only thinks
  about the difference (→ prompt carries the start material).
- Rounds to go were not shown (→ five exercises per session, "Exercise n of 5", summary).
- Cross-cutting: hover a move in a displayed line to see the position; in this tool only
  after the reveal, never while answering.

## Open questions (not yet asked)
- Time element on the main exercises; hand-off into a blindfold game vs engine.
- Feedback and grounding: the resulting position is computed by chessops; correctness is
  board-state; any "why" is engine-grounded.
