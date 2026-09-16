# Chessitout variant — interview notes

Source: user interview, 2026-09-16. One question per turn. Reference product: chessitout.com
(analyze, vote who wins, play it out; no public source).

## What it is
A two-player chess game that encourages engaging with ideas about **middlegame imbalances**.

## Loop
1. Both players are shown an imbalanced middlegame position where one side has a
   **non-obvious slight edge**.
2. Each player chooses which side they think has the edge.
3. If the players choose different sides, each plays the side they chose. So reading the
   position correctly earns you the better side. If both choose the **same** side, a different
   position is shown instead; both are told whether they were right or wrong, and a wrong
   player can return to that position later to see why.
4. They play the position out. Regardless of who picked correctly, both get to test their
   theory of what the advantages in the position are.
5. At the end, further analysis and discussion of the starting position and its consequences.

## Grounding
"Which side has the edge" is decided by engine evaluation (A1), and the end-of-game discussion
is built from engine and board facts (V3). Position sourcing needs a programmatic definition of
"imbalanced, slight, non-obvious edge" (eval band, material imbalance, low agreement between
shallow and deep search as a proxy for non-obvious).

## Position source
- The user's positions folder holds a good number of positions picked for this game. Plan:
  analyse them to derive criteria that generate and/or find more (same plan as the endgames
  introduction; one shared "position mining" effort).
- Main game: positions randomly selected or generated from a large pool.
- Optional (user is open to it): a **daily position** you can queue for, paired with a
  similarly ranked player who chose the other side. Implies a rating for this game and a
  matchmaking queue keyed on position plus disagreement.

## Engine play
Conditional ("if we enable"): the engine plays at the level of the player and always takes the
side opposite the player's choice. Depends on rating-calibrated engine play from the
bot-rating test subproject (Stockfish UCI_Elo / Maia); reuse, do not duplicate.

## Closing discussion
- Default **public** (shared between the two players); can be made private.
- Shape: both players propose their rationale for the side they chose, then the analysis is
  presented (grounded in engine and board facts), then the players are free to chat further on
  a **shared analysis board** (lichess-style: both can move pieces and see each other's lines;
  engine eval shown from a real engine call).
- Shared machinery: "state your reasoning, app checks it" is the same as the memory trainer's
  own-move discussion; the shared analysis board is reusable by group chess and the reviewer.

## Time control and pre-game
- Side choices are made **blind**: no communication before both have chosen.
- Players can pick the time control, but there is a **fixed default** so that most players
  queue for compatible games. The default value is not yet chosen.

## Notes
- Skipped positions need a stored per-user "revisit" list with the engine's verdict.

## Status
Interview closed 2026-09-16; the user may add more later.

## Open questions (not yet asked)
- Ratings and matchmaking beyond the daily queue; spectators; abandoned games.

**User feedback on the first slice (2026-09-16), fixed the same day:** the voting screen did not say whose move it is (it matters for the verdict); now shown above the material line, and the playing status says "Your move."

**Feedback pass 4 (2026-09-16):** a "Flip board" button while deciding who stands better (a
viewing aid only; resets to White's side for each new position). Every board app-wide now
highlights the previous move, including the mined position's last self-play move here.
