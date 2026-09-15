# human-chess — goals

Seeded from the init interview (2026-09-15, spine v0.6). Goals accrete through the review ritual (≤3 questions per contact) as dated appends; this is the first entry.

## 2026-09-15 — init interview (Q1)

**Premise.** An application that contains a set of chess learning, analysis, training tools, and mini-games (all referred to as subprojects). Subprojects include: Openings builder and trainer, Chessitout variant for training mid-games, endgames-focussed introduction to chess for new players, openings heuristic finder, memory trainer, vizualization trainer, test for what rating of bot you can beat from a certain opening/position, group plays chess, opening training game for who is better after N moves, game reviewer, and more. The over-arching goal is to make it easier for beginners to learn chess basics and harness advanced software tools without needing to learn a bunch of interpretation skills, as well as to provide an open-source alternative to many applications that are not free.

**Stack.** Open to suggestions, but I imagine it will be easiest if we mimic lichess' stack, as I think many open source projects we will be pulling from do this. (tentative — a design question for the loop/Q7 method)

**Method discipline (Q7).** Prototype fast, iterate on what breaks

**Elicited method discipline.**

I would like to begin with a survey of open-source chess projects (such as lichess, openingtree, leelachess and stockfish) so that we persist a library of existing re-usable code.
