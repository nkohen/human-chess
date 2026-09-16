# Memory trainer — interview notes

Source: user interview, 2026-09-16. One question per turn. Append as answers arrive.

## What is memorized
Your own real game, immediately after you finish it. You reconstruct as much of it as you can
from move one. When no longer confident, you click that you are done.

## Game source
- Priority: **smooth import of the most recent game from a lichess or chess.com account**, no
  copy-paste. The user cites openingtree.com as doing this for both sites. Lichess: public
  games export API without OAuth. Chess.com: its public games archive API (not yet surveyed;
  verify terms and rate limits before relying on it).
- Old games can also be run, lower priority.
- Cross-cutting: game import from both sites is shared with the game reviewer and the openings
  tools; it belongs in the shared layer.

## After "done"
Your reconstruction mistakes are discussed: situationally, what was happening at that point
and why. This discussion must be grounded in engine and board-state facts (A1/V3), with any
free text produced from those facts, never invented (chess-coach pattern).

## Purpose
Pattern recognition, and helping the user build a narrative that explains what is happening
and why. The user's framing: better mental models for why things happen is the fundamental
reframing that takes a beginner to intermediate and on to advanced intermediate.

## Reconstruction mechanics
- You enter **both sides'** moves.
- No immediate feedback on a wrong move. The app accepts it silently and continues from your
  version of the position. Mismatches are revealed only after you click the **"I have no
  idea"** button (this is the "done" button).
- Implication: after a wrong move the reconstructed game diverges from the real one, so the
  comparison has to align your sequence against the real game and find the first divergence
  and any later re-convergence, rather than a per-ply equality check.

## Discussion after "I have no idea"
1. A quick non-interactive replay from the start up to the last correct position.
2. Discuss the first divergence.
3. If the reconstruction rejoined the real game later, go on to the first divergence after that
   rejoin, and so on.

What the discussion is about: the **potential reasoning behind moves**, both the moves that
actually happened and the divergent moves when they are better or equal and would have made as
much or more sense. It is **not** about suggesting best moves. Grounding: "better or equal" is
an engine comparison of the real move against the remembered move (A1); the reasoning text is
built from engine and board facts (V3).

## Relationship to game reviewer
The user pictures this tool as a precursor to, and a potential partial seeder of, a game
review. Shared machinery to expect: game import, per-move engine comparison, "what was
happening here" fact extraction. Decompose that into the shared layer before both exist (A2).

## Discussion form, by whose move it was
- **Your own move**: you are asked to recall your reasoning (free text). The app analyses the
  validity and potential flaws of that reasoning.
- **Opponent's move**: you can only guess the motivation. You give your guess; the app analyses
  it, proposes possible alternative motivations with minimal analysis and potential flaws
  included, and asks you to **choose the option you find most plausible**. The choice is there
  to make the task salient.
- Grounding note: "analyse the validity of the user's reasoning" means checking the user's
  claims against board state and engine output (V3), e.g. "I thought the knight was hanging" is
  checked against attackers/defenders on that square. The LLM narrates; it does not judge on
  its own.

## Status
Interview closed 2026-09-16; the user may add more later.

## Open questions (not yet asked)
- What counts as a divergence when the remembered move is equal in eval: still discussed, as
  the user says, but is it flagged differently from a worse move?
- Any handling for very long games or a limit on how far reconstruction goes?
