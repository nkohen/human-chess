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

## Open questions (not yet asked)
- Adaptive difficulty.
- Eval presentation: centipawns vs win probability.
