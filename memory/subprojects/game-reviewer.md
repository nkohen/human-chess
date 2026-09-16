# Game reviewer — interview notes

Source: user interview, 2026-09-16. One question per turn. Depended on by: memory trainer
(divergence discussion, "where did it go wrong"), endgames introduction (progress detection,
deferred here), opening training game and group chess (standard post-game review), guess the
eval (analyze option).

## Number one takeaway
**"What thought process could have led me to a better move?"** The best move being on the
board does not mean the player is equipped to find it. The goal is not the best move but the
**best move findable with the tools the player has**.

## What the player should come away understanding
- why they won or lost;
- what their advantages and disadvantages were;
- where they could have picked better strategies in the middlegame;
- how they did in the opening;
- any takeaways from the endgame.
Purpose: make the emergent concepts of chess apparent by connecting them to the player's
actual game, in an accessible, level-appropriate way.

## Where Chess.com falls short (user's view)
- Too focused on the best move; good for experts, poor at **filtering for what is plausible
  for beginners and intermediates**.
- On "what if" counterfactual moves it drops the user straight into the analysis tool. More
  **guidance** should be given in response than "throwing Stockfish at the user".

## Grounding implications
- "Findable with their tools" needs a model of what a player at rating R sees: Maia move
  probabilities at R, explorer frequencies at R, and the player's own stated reasoning are the
  real data sources (A1). Move classification thresholds (Chess.com expected-points model) are
  a candidate presentation, filtered by findability.
- Every plain-language claim ("your bishop was bad", "you lost because of the weak d-pawn") is
  built from board-state and engine facts (V3), chess-coach pattern: facts computed first, LLM
  narrates.
- "What if" answers are engine-backed but presented as guidance: what the counterfactual move
  changes, in the same findability-filtered language.

## Interaction shape
1. A generated **report** the player goes through **move by move**.
2. At any point they can **make a move on the board to ask "what if"**. The response is a
   quick summary of why that move is good or bad, with a **suggestive line** to accompany it,
   and **recursive what-if** (they can keep playing moves into the counterfactual and get the
   same treatment at each step).
3. **Deferred** (user, 2026-09-16): having the player state their own reasoning. Not in the
   first version of the reviewer.

## Best move vs findable move
- The **best move, or best few when evals are comparable**, is **available** but not the
  focus.
- If the best move is **unfindable at the player's level**, then **on request** it comes with
  text saying it is a really hard move to find, plus a small justification that **previews an
  advanced concept**.
- Interface focus: **improving through understanding concepts applied in practice, not
  comparing to expert play.**
- Grounding: "comparable eval" is an engine MultiPV comparison; "unfindable at level" is the
  rating-conditioned findability model (Maia / explorer frequency); the concept preview is
  narrated from board facts.

## Level
User-configurable, **defaulting to the rating on their primary linked account** (lichess or
chess.com). The user is open to suggestions beyond this start. Cross-cutting: "primary linked
account" and "rating" are account-level concepts used by several subprojects (heuristic finder
default knob, bot-rating test, matchmaking); shared layer.

## The "standard review" shape (used by other subprojects)
Move list with classifications, eval graph, analysis board with engine, the move-by-move
report, and **what-if moves** (the recursive counterfactual from the interaction shape).
Computed **somewhat lazily**: not for every game up front; engine work happens when the review
is opened, and deeper pieces (per-move report text, what-if lines) on demand.

## Cross-link
"Play from this position" hands off from the review into the bot-rating test (user,
2026-09-16).

## Status
Interview closed 2026-09-16; the user may add more later.

## Open questions (not yet asked)
- Shareable reviews (coach).
- Sources: linked accounts, PGN, in-app games.
