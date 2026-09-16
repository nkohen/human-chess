# Openings heuristic finder — interview notes

Source: user interview, 2026-09-16. One question per turn. No comparable product found in
either survey; this one is original.

## What it is
A **computational tool, not a user-facing app**, integrated into other subprojects (the
openings builder and trainer is the obvious consumer).

## Input and goal
- Input: an opening defined as a **tree** of moves (the repertoire format the openings builder
  produces).
- Goal: find a **tractable set of heuristics** that make learning that opening more conceptual
  and more tractable than memorising the tree.
- Second goal: **suggest strong-enough alternative moves** that make the heuristic set more
  cohesive, i.e. trade a little engine strength for a line that follows the same rules of
  thumb as the rest of the tree.

## Grounding
"Strong enough" is an engine or explorer measurement (A1). A heuristic is only kept if it is
checked against the tree's positions by board-state queries (V3), never asserted free-form.

## What a heuristic looks like
The user does not want the notion restricted this early. Examples given:
- Scandinavian, as Black: once main-line development is done and White's queen has moved
  forward on the d-file, castle kingside ASAP.
- Queen's Gambit Declined: the conditions under which d4 takes e5 (a simpler, capture-timing
  heuristic).
- If the opponent fianchettoes their kingside bishop, you do too.
Common shape so far: a **condition over board state** (development status, piece placement,
opponent's structure) plus an **action** (a move or a class of moves). Conditions range from
concrete squares to abstract notions like "main-line development done".

## Generating openings from heuristics
The user also wants to try building **sound openings generated from heuristics** (the inverse
direction: heuristics in, tree out, engine-checked for soundness). Known main obstacle: finding
a heuristic for the **exceptions** to a heuristic. This suggests a recursive structure,
heuristic plus exception-heuristics, with a cap on depth as part of "tractable".

## Where candidates come from
A mix of: a concept vocabulary, statistical mining, and LLM proposal followed by verification.
The vocabulary's starting point should be **mined from professional chess literature** that
teaches or describes chess (licensing and sourcing to be raised before any text is ingested;
the literature is copyrighted even if the concepts are not).

## User-proposed heuristics
A user should be able to **propose a heuristic in their own words**; the tool tests its
validity against the tree (and engine/explorer data) and, where it fails, tries to generate a
heuristic for the exceptions. Purpose: let the user put more of the opening into their own
words. This is the same "state your reasoning, app checks it" loop as the memory trainer and
Chessitout, applied to a whole opening rather than one move.

## Strength tolerance
- A **user-settable knob** with a sane default derived from the user's rating.
- Also weigh whether the **refutation line is findable by a player of their rating**: a line
  that proves the alternative worse only matters if opponents at that level find it. This lets
  the user decide between adding exceptions for robustness and being confident it does not
  matter at their level.
- Grounding for "findable at rating R": lichess explorer frequency of the refuting move at
  that rating band, and/or Maia's move probability at that rating (both real data, A1). The
  eval side is Stockfish.

## What "tractable" means
Not a formal cap. It means the set **fits better in the human mind**: less memorisation, and
the opening chunked into concepts rather than blindly memorised moves. Any metric is a proxy
for that (fewer rules covering more of the tree, shallower exception chains).

Also in scope: **negative heuristics**, rules for when a tempting move is bad, to help remember
what not to play in given situations.

## Status
Interview closed 2026-09-16; the user may add more later.

## Open questions (not yet asked)
- Presentation inside the openings trainer; on-demand vs batch over a repertoire.
- Does it consume engine analysis, explorer statistics, or both?
