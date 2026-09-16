# Opening training game (who is better after N moves) — interview notes

Source: user interview, 2026-09-16. One question per turn.

## Loop
- Two players play **N moves** from the start. N is **fixed** (possibly a few preset options,
  not free choice).
- The **end position is engine-evaluated** and the winner is whoever stands better. No human
  judgement step; the engine verdict is the result (A1: the eval shown is the real engine
  output, with depth/time recorded).

## Deciding the winner
- A **draw band around zero** of some size. Width undecided; the user is open to suggestions
  and to trying out different presentations and evaluation schemes.
- Candidate schemes to try (coordinator, to be tested, not decided): (a) centipawn band, e.g.
  |eval| < 0.3 is a draw; (b) Stockfish's own WDL output (UCI_ShowWDL) with a draw when
  win and loss probabilities are both below a threshold; (c) Chess.com-style expected points
  from eval plus rating. Whichever is used, the shown number is the engine's own output.

## Opponent
Both human and engine. Engine plays at the player's level (same rating-calibrated engine as
the Chessitout variant and the bot-rating test; shared layer). Human play has a **queue and a
rating** for this game (shared matchmaking machinery with the Chessitout variant).

## After the result
The standard post-game review and analysis shape that normal chess games have (as on lichess:
result, analysis board, engine, move list), with "new game" as an option. Not the Chessitout
state-your-reasoning shape. This reuses the game reviewer subproject.

## N and time
- N to be tuned; starting points **12 and 20** moves, chosen by level.
- The game is **timed**; the exact control is to be tuned.

## Starting position
- **Matchmade queue games always start from move one.**
- **Direct challenges** and (as read; the user wrote "not games", almost certainly "bot
  games") engine games can start from a **specific opening**.
- Maybe an **opening of the day**.

## Status
Interview closed 2026-09-16; the user may add more later.

## Open questions (not yet asked)
