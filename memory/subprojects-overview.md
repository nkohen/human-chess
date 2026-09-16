# Subprojects overview

human-chess is a collection of chess learning, analysis, training tools, and mini-games. The
unit of organization is the **subproject**: each is a self-standing tool or mini-game with
its own focus.

Named subprojects from the project premise:

- **Openings builder and trainer** — build opening repertoires and drill them.
- **Chessitout variant** — a variant aimed at training mid-games.
- **Endgames introduction** — an endgames-focused introduction to chess for new players.
- **Openings heuristic finder** — finds heuristics for openings.
- **Memory trainer**
- **Visualization trainer**
- **Bot-rating test** — what rating of bot you can beat from a given opening or position.
- **Group plays chess**
- **Opening training game** — who is better after N moves.
- **Game reviewer**
- **Puzzles** — rated tactics puzzles (added by the user 2026-09-15 from the landscape survey;
  lichess puzzle dump is the obvious CC0 source).
- **Guess the eval** — judge a position, score against the real engine eval (added 2026-09-15).
- **Hand and Brain** — the two-role team variant (added 2026-09-15; distinct from group chess).
- (and more, added as the project grows — the list above is the user's own from the init interview, 2026-09-15)

Deferred, documented only (user, 2026-09-15): **player insights tooling** — aggregate weakness
reports across many of a player's games (Aimchess-style, by phase and by opening). Not a
subproject for now; see docs/research/2026-09-15-commercial-landscape.md.

Considered and declined or folded into existing subprojects (user, 2026-09-15): guess the Elo,
coordinate drills (part of the visualization trainer), photo position import, rating estimate
from a test, repertoire deviation review, assisted-analysis overlay, personality quiz,
human-like play at a rating as a standalone mode, study authoring, live chat play. Do not
re-propose these without new information.

Notes for future sessions:

- Chess rules come from the lichess-derived rules library, not re-implemented; analysis comes
  from integrated open-source engines (user, 2026-09-15).
- Stack decided (user, 2026-09-15): TypeScript for everything not computationally intensive;
  Rust compiled to WebAssembly is the option for compute-heavy parts. Rules: chessops (TS) and,
  for any Rust module, shakmaty (both by niklasf, both GPL-3.0). Board: chessground. Basis:
  docs/research/2026-09-15-reuse-survey.md section 4. Recorded in CLAUDE.md.
- "Chessitout" = chessitout.com (user confirmed 2026-09-15): a vote-on-who-is-better then
  play-it-out game with no public source. The user's variant changes multiple things; the user
  said discussing what is premature. Do not design it until the user reopens it.
- User's own tool use (2026-09-16): heavy openingtree.com user for diagnosing opening weaknesses;
  formerly used Aimchess's probabilistic opening trainer. Relevant to the openings tools' UX.
- Per-subproject detail lives in memory/subprojects/<name>.md as the user interview (started
  2026-09-15) fills each in; this file stays the index of subprojects.
- Interview format (user, 2026-09-15): **one question per turn**, so it feels like an interview.
  Do not batch questions. Order the user chose: 1 Endgames introduction, 2 Memory trainer,
  3 Chessitout variant, 4 Openings heuristic finder, 5 Openings builder and trainer, 6 Opening
  training game (N-move), 7 Group plays chess, 8 Guess the eval, 9 Game reviewer, 10 Bot-rating
  test, 11 Puzzles, 12 Hand and Brain, 13 Visualization trainer. Progress: all 13 done (memory/subprojects/: endgames-introduction, memory-trainer, chessitout-variant, openings-heuristic-finder, openings-builder-trainer, opening-training-game, group-plays-chess, guess-the-eval, game-reviewer, bot-rating-test, puzzles, hand-and-brain, visualization-trainer). **Interview complete 2026-09-16.**
- Treat each subproject as a distinct piece of work; keep shared code deliberate and reviewed
  so changes for one subproject do not silently break another.
