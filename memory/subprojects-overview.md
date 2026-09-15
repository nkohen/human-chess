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
- (and more, added as the project grows — the list above is the user's own from the init interview, 2026-09-15)

Notes for future sessions:

- Chess rules come from the lichess-derived rules library, not re-implemented; analysis comes
  from integrated open-source engines (user, 2026-09-15).
- The stack is not yet chosen. The stated intent is to mimic lichess' stack, because many of
  the open-source projects human-chess will pull from do the same. Record the stack decision
  here (and in CLAUDE.md) once it is actually made.
- Treat each subproject as a distinct piece of work; keep shared code deliberate and reviewed
  so changes for one subproject do not silently break another.
