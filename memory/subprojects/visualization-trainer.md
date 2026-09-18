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

**Built 2026-09-17: position memorizer.** The first of the two "Extra modes" above: a mode
switch (SegmentedControl, guarded localStorage) at the top of the route, "Lines" (the trainer
above, unchanged) and "Memorize". Five positions per session: settings (study time 5/10/20s,
default 10s as a first guess; source random-play or the curated pool from `packages/positions`,
default random), then per position a view-only board with a study countdown, then an empty
`BoardEditor` (chessground free mode) with a count-up rebuild clock, "Done" to submit. Scoring
is pure board-state comparison in the new `subprojects/visualization-trainer/src/memorize.ts`
(no engine call in this mode at all): the original position's pieces (`occupiedSquares`/
`pieceAt`, always legal) are compared square by square against the rebuild's pieces, read via a
new `packages/rules` export, `piecesOfPlacement`, added because the rebuild may be an illegal
placement mid-edit (missing/doubled king) and the usual `positionFromFen` path requires
legality; `piecesOfPlacement` reads chessops' own board parser directly, so it is still a
rules-library read, never hand-parsed FEN (A1). Score = correct / pieces in the original;
missing/extra/wrong-piece squares are listed in plain language, colour and role both ("h1:
white rook missing", "e5: you put a black knight, it was a white knight"). After each position,
the original and rebuilt boards show side by side above a size threshold and stacked below it
(the phone case gets the full slot width each, so the pair stops fitting one row and flex-wrap
actually wraps; halving unconditionally never would); a session summary shows a score bar per
position plus the average. Both modes are five rounds (`MEMORIZE_ROUNDS = 5`, matching Lines'
`ROUNDS`); orientation is always white for both boards (not built: orienting by side to move, or
per-curated-position orientation). Not built: the obscuration ladder and blindfold mode (the
other "Extra modes" entry), any position source beyond random-play and the curated pool, and
tuning the study-time default against real usage (10s is a first guess). Switching mode
mid-session (Lines <-> Memorize) silently abandons whatever session is in progress, no
confirmation — accepted as a first guess, not a deliberate UX call. Diffing and scoring logic
(`memorize.ts`) and the new `piecesOfPlacement` rules export are unit-tested; `npx pnpm@10 check`
passes. The `screenshots.mjs visualization` harness only covers the route's default first-paint
state (Lines mode, since that is the persisted default), so it verifies the mode switch is the
first control on screen on the phone but does not itself exercise Memorize mode; Memorize's
phases were checked manually instead.

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
