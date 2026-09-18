# Guess the eval — interview notes

Source: user interview, 2026-09-16. Added to the list 2026-09-15 from the landscape survey.
References: ChessVal (numeric guess, 100 minus absolute error), GoudaChess Chess Arcade.

## Guess
The player guesses a **number on an eval scale** (not just which side is better). The scale
and its clipping (ChessVal uses [-10, +10]) are not yet chosen.

## Position source
A user **option**: positions from **real games** (lichess CC0 dumps) or from the
**pedagogical pool** (the same curated/mined pool as the Chessitout variant and endgames
introduction; one shared position store).

## Grounding
The answer is a real engine evaluation at a recorded depth/time (A1). The eval scale shown to
the player is the engine's own.

## Scoring
A set of **bands** that try to capture qualitative differences (e.g. equal, slightly better,
clearly better, winning, and the mirror), rather than raw distance. Band edges not yet chosen;
Stockfish's WDL output is a candidate basis for making the bands mean the same thing at
different phases.

## Session formats
- **Endless**.
- **Fixed number** of positions, so scores are comparable between people.
- **PvP on a fixed number**, with a **GeoGuessr-like experience**: both players get the same
  positions, guess independently, then see each other's guesses and the answer per round, with
  a running score.

## Time
- **PvE**: the player chooses whether there is a time limit.
- **PvP**: always timed, and the timer is also affected by the opponent locking in their
  answer (GeoGuessr-style: once one player locks in, the other gets a short countdown).

## After the guess
- Always shown: the **correct eval** and the engine's **top line**.
- **PvE**: an option to **analyze** the position right there.
- **PvP**: an option to analyze **any position at the end** of the match, not mid-match.
- Analysis = the shared analysis board / reviewer machinery; the top line is the engine's PV.

## Status
Interview closed 2026-09-16; the user may add more later.

**First slice built 2026-09-16** (subprojects/guess-the-eval, hosted at `#/guess-the-eval`):
position from engine self-play (6 random plies then 14 engine plies at depth 6, never a finished
position; packages/positions selfPlay.ts), a centipawn slider guess, lock in, reveal the depth-14
engine score from White's perspective with engine name and depth on screen, band verdict
(±0.30 / ±1.00 / ±2.00 pawns), distance from the truth, top line in SAN, running same-band tally,
endless "next". Not built: adaptive difficulty, win-probability presentation, real-game or
curated positions, saving results. Reviewed by the code-reviewer agent 2026-09-16; findings fixed.

**User feedback on the first slice (2026-09-16), all addressed in the second pass:**
- Say whose turn it is (it affects the eval).
- After guessing, show the bands, the guess and the answer on the slider's line.
- Positions were all equal-material early middlegames; wants more variation (→ position
  recipes in packages/positions: quiet, sharp, late, imbalanced).
- Rounds to go were not shown (→ five positions per round, "Position n of 5").
- Default mode should score more like GeoGuessr (→ points per position decaying with the
  distance from the truth, total over the round; the exact curve is a first guess to tune).
- Cross-cutting: hovering a move in any displayed line should show the position (→ MoveLine
  in packages/board).

**Feedback round 2 (2026-09-16), addressed the same day:**
- Split the winning band into winning and dominating (→ nine bands, dominating at ±500 cp,
  first guess).
- Hover previews glitched, probably rendering off the bottom of the screen and correcting (→
  fixed-position preview that never touches layout or the pointer, flips above when needed).
- "Next position" is the primary button: put it at the top, centred.
- Right-click highlights and right-drag arrows on the board, as on other board UIs (→
  chessground's drawable enabled on every Board by default, cleared when the position changes).
- The results page should be visual: bars, not text (→ total bar, per-position points bars and
  compact eval scales).

**Built 2026-09-17** (PvP, time limits, analyse-after-guessing): a settings screen (`Page`)
before the round picks solo vs pass-and-play PvP, and the time limit; the round itself stays a
`Workbench`. **PvE time limit**: none (default) / 15s / 30s / 60s per position, a plain-text
countdown plus a thin bar near the slider; on expiry the current slider value locks in as the
guess and the reveal says the time ran out. **PvP**: same-device pass-and-play only (no rooms;
`packages/rooms` is still reserved and unbuilt) — two named players (defaults "Player 1"/"Player
2", editable, both persisted), both see the same five positions, a hand-over screen ("Pass to
&lt;name&gt;") hides the slider from the other player between guesses, reveal shows both guesses
and the answer on one eval scale plus per-player points, running score, and a results screen with
both totals, per-position points side by side, and a winner line. PvP is always timed; default
30s, options 15/30/60s (first guess, same three options as PvE). The interview's GeoGuessr rule
("once one player locks in, the other gets a short countdown") needs simultaneous play and isn't
buildable pass-and-play, so it's replaced with a recorded decision: **player 2's limit is
min(chosen limit, the time player 1 actually used + 10s)**, first guess, pure function in
`timing.ts` (`pvpSecondPlayerLimitMs`), tested. **Analyse after guessing**: PvE gets an "Analyse
this position" button on the reveal that turns the board movable for both sides (legal moves via
`@human-chess/rules`) with undo and a top-three-lines MultiPV panel (depth 16, engine name and
depth on screen, streamed like openings-builder's `MultiPvPanel`) and a "Back to the round" exit;
PvP only offers analysis on the results screen, for any of the five positions, per the interview
("any position at the end, not mid-match"). Scoring stayed in `scoring.ts`, unchanged. Not built:
real-time/networked PvP (still pass-and-play only), saving results (still in-memory per round),
a shared/multiplayer analysis board (each analyse session is local to the viewer).

## Open questions (not yet asked)
- Adaptive difficulty.
- Eval presentation: centipawns vs win probability.
