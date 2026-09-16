# Memory Index — human-chess

This file is the index for cross-session memory. Always loaded. Keep under 200 lines.

Each entry is one line: `- [Title](file.md) — one-line hook`

<!-- [Conv #1 counter-pattern] A populated index is the drift-discipline signal.
     An empty index is the passive form of the corpus-wide failure mode. -->

---

- [Subprojects overview](subprojects-overview.md) — the user's full list of chess tools and mini-games (13 named, 3 added 2026-09-15), what was declined or deferred, stack and Chessitout notes
- [Adopted practices](adopted-practices.md) — four practices taken from the 2026-09-15 class-practice review, each with a drop condition, plus the licensing raise-it rule; the license substance is the user's decision
- [Reuse library ledger](reuse-library.md) — every outside code/data candidate with verified license and obligation; nothing adopted yet; project license AGPL-3.0-or-later (2026-09-15), stack TypeScript + Rust/wasm
- [Research docs](../docs/research/) — 2026-09-15: class-practice review, open-source reuse survey (licenses verified), and the commercial-product landscape organized by subproject; read the landscape doc before designing any subproject
- [Shared layer](shared-layer.md) — the cross-cutting pieces every subproject interview surfaced (engine service, calibrated play, import, account, position store, fact extraction, concept library, multiplayer, review); decompose this before the second subproject
- [Subproject interviews](subprojects/) — one file per subproject with the user's answers (all 13 done 2026-09-16); read the relevant file before designing or building that subproject
