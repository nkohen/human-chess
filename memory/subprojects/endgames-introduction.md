# Endgames introduction — interview notes

Source: user interview, 2026-09-15. One question per turn. Append as answers arrive.

## Audience
Any beginner. Does not assume they know how the pieces move; also for players who know the
rules but have never studied.

## Core idea
Start from tractable positions. Teach that the in-game goal is not to hunt checkmate all the
time but to reach, or reduce the game into, a winning endgame. The curriculum walks backwards
from the simplest won endgame toward the end of the middlegame.

## Curriculum sequence (user's own order)
0. Even earlier than K+Q vs K (added 2026-09-16): unobstructed ladder mate with two rooks, then
   obstructed ladder mate where the rooks must be rotated to the other side of the board.
1. K+Q vs K (checkmate).
2. K+R vs K.
3. K+2P vs K: connected pawns; far apart; slightly apart.
4. 3 pawns vs 2 on one side plus one pawn each on the other side.
5. K+N+P vs K+P.
6. K+B+P vs K+P.
7. Q vs R, Q vs B, Q vs N, Q vs advanced pawn.
8. ... and so on, until the starting positions are the very end of the middlegame.

## Teaching piece movement
No separate rules primer. Each new position after the first introduces at most one new piece.
On first appearance a pop-up shows a graphic animation of the piece making legal moves, with a
very short minimalist description and the standard highlighting. Selecting a piece shows its
legal moves, as is standard (chessground's dests highlighting; legality from chessops).
Implication: the first position (two rooks vs king) introduces the king and rook together, so
it is the one exception to "at most one piece".

## Play loop
- The learner plays the position out against an **uninhibited engine** (full strength, no
  weakening). Every starting position is a theoretical win, so they should win even against
  perfect defence. Engine: Stockfish over UCI or stockfish-web in the browser; for these
  positions Syzygy tablebase play is the exact defence (lila-tablebase / Fathom candidates).
- On success: prompt "Do you think you can consistently always win this game or should we
  win one more time?" with two options, "I'm Confident!" and "Play Again".
- On failure: the first few times, just try again. If they are not making progress, intervene
  with a hint or leading question when they reach the troublesome position. This forms a loop:
  play, fail, retry, hint at the sticking point, retry.
- Deferred (user, 2026-09-15): how "not making progress" is detected and how the troublesome
  position is identified. Revisit after the game reviewer subproject is fleshed out, since
  that is where "where did it go wrong" logic will live.

## Progression
- "I'm Confident!" leads straight to the next position. No extra check.
- Previous positions are always replayable.
- Skipping ahead is allowed, behind a prompt asking if they are sure, since it is not
  recommended.
- Design stance (user): engaging and useful **scaffolding, not gamification**. There is already
  a game here, chess. No points, streaks, lives, or badges in this subproject.

## Sides and colours
- Learners begin with winning positions. Later, drawing positions are introduced: K vs K+P,
  Q vs Q and other perpetual-check holds, and positions reducible to these.
- Colour does not matter; randomize it.

## Meta: hand-off to other tools
At some point, even with positions left to master, the learner is nudged toward a different
tool that gets them closer to playing a full game, such as a beginner opening tutorial. The
key lesson for a first-time player, which the nudge should carry:
- don't lose pieces;
- if the opponent loses pieces, trades benefit you, because they bring a winning endgame closer;
- if you are down pieces, keep things complicated without losing more.

## Meta: position source
The user has a **folder of pedagogically interesting positions**. Plan: analyse those to find
programmatic ways of finding and/or constructing more such positions (candidate signals:
tablebase WDL/DTZ, material class, engine eval stability). Ask the user for the folder when
this subproject starts.

## On-screen baseline
Just the board, with legal moves shown when a piece is selected. Check and checkmate are
described at the start of the first lesson only. After that, extra help appears only when the
learner fails (hint loop) or takes an explicit action to request it. No goal line, no plan text
by default.

## Requested help
Form of help is situational (per position, per sticking point); not fixed to one of hint /
plan / best move. Help requests are **tracked for monitoring only**; they never change
functionality, and in particular never alter the success prompt.

## Hard-coded then procedural
The experience is hard-coded up to a certain level; after that the sequence is procedurally
generated (this is where the analysis of the user's positions folder feeds in). At some later
point the learner also gets a nudge toward the puzzles subproject.

## Engine feel and time
- No time element of any kind.
- The engine always tries to prolong the game and make it tricky (maximal resistance: for
  tablebase positions that is the DTZ/DTM-maximizing defence, not merely the best eval).

## Status
Interview closed 2026-09-16; the user may add more later.

**First slice built 2026-09-16** (subprojects/endgames-intro, hosted at `#/endgames`): four
hard-coded rungs (two two-rook ladders, K+Q vs K, K+R vs K) with intro text, random colour with
the position mirrored for Black, play against full-strength wasm Stockfish in the browser
(600 ms per move), the exact success prompt with "I'm Confident!" / "Play Again", draw reasons
in plain words from chessops queries, retry on failure, skip behind an "are you sure", lesson
list with earlier rungs always playable, confidence stored per browser. Not yet built: animated
piece pop-up (text only), hints on repeated failure (deferred until the reviewer exists),
tablebase-backed defence (engine only; fine for these rungs), later rungs (pawn endings,
Q vs R/B/N, drawing positions), the user's positions folder, the nudge to the opening tutorial
and to puzzles, help-request tracking. Verified by vitest (rules, engine, positions, game
state) and one hand-driven Chrome DevTools smoke run (handshake, move, engine reply).

## Open questions (not yet asked)
