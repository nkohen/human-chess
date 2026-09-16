# Minimal slices — one per subproject, for early feedback (user direction, 2026-09-16)

The user wants a super-minimal version of every subproject that admits one, before effort
goes deep anywhere, so they can give feedback early. "Minimal" here = the smallest thing that
shows the core loop end to end with real engine/board output, no polish, no accounts, no
multiplayer. Each row says what the slice is and what shared work it forces. Order is by cost.

| # | Subproject | Minimal slice | Forces |
|---|---|---|---|
| 1 | Endgames intro | done 2026-09-16: four rungs vs full-strength engine | — |
| 2 | Guess the eval | done 2026-09-16: engine self-play position, slider guess, band score, reveal eval + top line, endless | position generator in `positions`; SAN line helper in `rules` |
| 3 | Opening training game | play 12 moves vs engine from move one, engine evaluates the end, draw band verdict | a shared "play a game vs opponent" hook lifted out of endgames-intro |
| 4 | Bot-rating test | play vs engine at a chosen UCI_Elo from move one; win → offer the next level; games kept in localStorage with provenance | calibrated opponent in `play` (UCI_LimitStrength + UCI_Elo) |
| 5 | Visualization trainer | done 2026-09-16: position shown, a short engine line given in SAN, questions about the unseen end position (check? piece on square? material?) answered from chessops | fact questions in a first `facts` package |
| 6 | Hand and Brain | hot-seat on one device, two human pairs (per the interview: humans only), brain picks a piece type from buttons, hand moves; no clocks | `legalDestsByRole` in `rules` |
| 7 | Openings builder/trainer | build a tree by playing moves with MultiPV suggestions, saved in localStorage; drill: app plays tree replies, wrong move stops | tree model; MultiPV UI |
| 8 | Chessitout variant | solo: mined imbalanced position, pick a side, play it out vs engine, end eval | position mining by eval band + material imbalance |
| 9 | Memory trainer | lichess username → most recent game fetched → reconstruct from move one, "I have no idea" ends, first divergence shown | `import` (lichess API + PGN via chessops) |
| 10 | Game reviewer | import or paste PGN → per-move eval, diff, classification, best move | `import`, `review` |
| 11 | Puzzles | a few thousand puzzles sampled from the lichess CC0 dump, play through | puzzle data sample |
| — | Group plays chess | no honest minimal without rooms; deferred until `rooms` exists | — |
| — | Openings heuristic finder | no minimal that is not misleading; deferred | — |

Status log: 2026-09-16 slices 2 and 5 built by Sonnet workers and merged; slice 2 reviewed and
fixed. In flight: the shared play hook lifted into `packages/play` (`./react` subpath) with a
`limitedStrength(elo)` opponent and UCI option restoration in the engine wrapper (a limited-
strength game must not weaken later evals); slices 6 and 7 in worktrees.
