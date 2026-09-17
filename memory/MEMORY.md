# Memory Index — human-chess

This file is the index for cross-session memory. Always loaded. Keep under 200 lines.

Each entry is one line: `- [Title](file.md) — one-line hook`

<!-- [Conv #1 counter-pattern] A populated index is the drift-discipline signal.
     An empty index is the passive form of the corpus-wide failure mode. -->

---

- [Subprojects overview](subprojects-overview.md) — the user's full list of chess tools and mini-games (13 named, 3 added 2026-09-15), what was declined or deferred, stack and Chessitout notes
- [Adopted practices](adopted-practices.md) — four practices taken from the 2026-09-15 class-practice review, each with a drop condition, plus the licensing raise-it rule; the license substance is the user's decision
- [Reuse library ledger](reuse-library.md) — every outside code/data candidate with verified license and obligation; adopted 2026-09-16: chessops, chessground, nmrugg stockfish (GPL, source offer when shipping); project license AGPL-3.0-or-later
- [Research docs](../docs/research/) — 2026-09-15: class-practice review, open-source reuse survey (licenses verified), and the commercial-product landscape organized by subproject; read the landscape doc before designing any subproject
- [UI design spec](../docs/design/2026-09-17-ui.md) — 2026-09-17: the shared look decided after a twelve-screen survey; `packages/ui` built from it the same day (tokens, primitives, Workbench/Page/AppShell); adoption rules for migrating each subproject onto it
- [Shared layer](shared-layer.md) — cross-cutting pieces from the interviews and the directory decomposition (built: rules, board incl. MoveLine, engine, play, positions incl. recipes, facts, import, review, lichess, site-client, chesscom; reserved names for the rest); tooling decisions of 2026-09-16 and why
- [Subproject interviews](subprojects/) — one file per subproject with the user's answers (all 13 done 2026-09-16); read the relevant file before designing or building that subproject
- [Minimal slices](minimal-slices.md) — user direction 2026-09-16: a super-minimal version of every subproject first, for early feedback; all 11 slices built 2026-09-16, routes per row; feedback pass 1 (guess-the-eval, visualization) built the same day; the user's comments on the other nine are next
