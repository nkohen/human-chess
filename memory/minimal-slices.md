# Minimal slices — one per subproject, for early feedback (user direction, 2026-09-16)

The user wants a super-minimal version of every subproject that admits one, before effort
goes deep anywhere, so they can give feedback early. "Minimal" here = the smallest thing that
shows the core loop end to end with real engine/board output, no polish, no accounts, no
multiplayer. Each row says what the slice is and what shared work it forces. Order is by cost.

| # | Subproject | Minimal slice | Forces |
|---|---|---|---|
| 1 | Endgames intro | done 2026-09-16: four rungs vs full-strength engine | — |
| 2 | Guess the eval | done 2026-09-16: engine self-play position, slider guess, band score, reveal eval + top line, endless | position generator in `positions`; SAN line helper in `rules` |
| 3 | Opening training game | done 2026-09-16 (`#/opening-game`): play 12 or 20 moves vs engine from move one, engine evaluates the end, draw band verdict | a shared "play a game vs opponent" hook lifted out of endgames-intro |
| 4 | Bot-rating test | done 2026-09-16 (`#/bot-rating`): play vs engine at a chosen UCI_Elo from move one; win → offer the next level; games kept in localStorage with provenance | calibrated opponent in `play` (UCI_LimitStrength + UCI_Elo) |
| 5 | Visualization trainer | done 2026-09-16: position shown, a short engine line given in SAN, questions about the unseen end position (check? piece on square? material?) answered from chessops | fact questions in a first `facts` package |
| 6 | Hand and Brain | done 2026-09-16 (`#/hand-and-brain`): hot-seat on one device, two human pairs (per the interview: humans only), brain picks a piece type from buttons, hand moves; no clocks | `legalDestsByRole` in `rules` |
| 7 | Openings builder/trainer | done 2026-09-16 (`#/openings`): build a tree by playing moves with MultiPV suggestions, saved in localStorage; drill: app plays tree replies, wrong move stops | tree model; MultiPV UI |
| 8 | Chessitout variant | done 2026-09-16 (`#/chessitout`): solo: mined imbalanced position, pick a side, play it out vs engine, end eval | position mining by eval band + material imbalance |
| 9 | Memory trainer | done 2026-09-16 (`#/memory`): lichess username → most recent game fetched → reconstruct from move one, "I have no idea" ends, first divergence shown | `import` (lichess API + PGN via chessops) |
| 10 | Game reviewer | in flight 2026-09-16: import or paste PGN → per-move eval, diff, classification, best move | `import`, `review` |
| 11 | Puzzles | done 2026-09-16 (`#/puzzles`): puzzles fetched one at a time from the lichess puzzle API (CC0) instead of a dump sample; solution line from the puzzle data | lichess puzzle API |
| — | Group plays chess | no honest minimal without rooms; deferred until `rooms` exists | — |
| — | Openings heuristic finder | no minimal that is not misleading; deferred | — |

Status log: 2026-09-16, one session: slices 2-9 and 11 built by Sonnet workers in worktrees,
merged by the coordinator, reviewed by the code-reviewer agent (slices 2, 5, 6, 7, 9 and the import
layer; findings fixed), committed. Shared work that landed with them: `packages/play` generic game
state + `useEngineGame` (`./react`) + `limitedStrength(elo)`; UCI option restoration and `stop()`
in the engine wrapper; `packages/facts`, `packages/import`, `packages/engine/src/score.ts`
(whitePerspective, formatScore); rules helpers (sanLine, pgn, roles, pieceAt, START_FEN,
fullmove). Not yet reviewed: opening training game, bot-rating test, puzzles, Chessitout. No
browser run of the new slices yet (tsc + vitest + vite build only). Slice 10 (game reviewer +
`packages/review`) in flight. All bands and thresholds (draw band 30 cp, imbalance band 150 cp,
classification cutoffs) are first guesses marked in code for the user to tune.
Follow-up: memory-trainer/src/reconstruction.ts duplicates packages/play game state (no-playerColor mode); auto-queen idiom repeated in six files, wants one helper.
