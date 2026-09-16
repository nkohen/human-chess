# Group plays chess — interview notes

Source: user interview, 2026-09-16. One question per turn. Landscape references: Chess.com
Vote Chess (rolling plurality), Kasparov vs the World (staged cycle), Twitch chat tallies.

## Shape
- **One group against an engine** rated slightly above the players (rating-calibrated engine
  from the shared layer). The user is also open to **group vs group** (pvp).

## Move decision, per move
1. **Sealed vote**: each player submits a move privately.
2. All votes are **unsealed**.
3. **Discussion**.
4. **Final vote** on the best move; that move is played. (Tie-break not yet asked.)
This is the Kasparov-vs-the-World staged shape, compressed, with the sealed round added.

## Scoring
Two layers, independent of each other:
- the **group** wins or loses the game;
- each **player** gets individual **accuracy scores** from their own votes, independent of
  what the group ends up playing. **Sealed-vote accuracy and final-vote accuracy are scored
  and reported separately** (what you saw alone vs. how well you were persuaded). Grounding:
  accuracy is the engine's eval loss for the voted move versus the engine's best move (A1); a
  Chess.com-style expected-points scale is one candidate presentation.

## Timing and rules
- **Live, timed play** is the main interest; per-phase clocks. Longer-running asynchronous
  sessions (Vote Chess style) may be supported in the future.
- **Engine use is off limits** during discussion. The app itself shows no engine output until
  the game is over (in-app enforcement; external engine use cannot be policed).

## Rooms and discussion medium
- **Private rooms** (friends) are the priority. Open lobbies and matchmaking are possible
  later.
- Discussion medium: **text chat** plus **at least one shared board** with **no analysis
  tooling** (pieces can be moved to show lines; no engine, no explorer). This is a stripped
  variant of the shared analysis board wanted by the Chessitout variant; same component, tools
  disabled.

## Resolving the final vote
- Default: plurality wins; **ties are broken at random**.
- Alternative mode: the played move is **always drawn at random, weighted by vote count**.

## After the game
The standard review (game reviewer subproject), with the shared board and chat still
available, plus the **vote data** (sealed and final votes per player per move) viewable from
within the review.

## Status
Interview closed 2026-09-16; the user may add more later.

## Open questions (not yet asked)
- Per-phase clock values; group size limits.
