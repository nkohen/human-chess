# human-chess

<!-- [Conv #1, 18/18 corpus harnesses] Hand-maintained memory drifts silently — verified
     in davila7/claude-code-templates (CLAUDE.md vs rules/ conflict visible in the files),
     sst/opencode (post-crash drain "process-local until clustering"), cline/cline (2-line
     stub, nothing carries across sessions). Counter-pattern: this file + memory/MEMORY.md
     form the drift-disciplined core. Keep both current and consistent. -->

**human-chess** is an application that bundles a set of chess learning, analysis, training
tools, and mini-games — each one called a subproject. Named subprojects include an openings
builder and trainer, a Chessitout variant for training mid-games, an endgames-focused
introduction to chess for new players, an openings heuristic finder, a memory trainer, a
visualization trainer, a bot-rating test, group chess, an N-move opening game, a game
reviewer, puzzles, guess-the-eval, Hand and Brain, and more (the full list is in
`memory/subprojects-overview.md`).

**Stack (user, 2026-09-15): TypeScript for everything that is not computationally intensive;
Rust compiled to WebAssembly is the option for compute-heavy parts.** Rules come from chessops
(the lichess TypeScript rules library; shakmaty is the Rust counterpart if a Rust module ever
needs rules); the board is chessground. Basis: docs/research/2026-09-15-reuse-survey.md,
section 4. Tooling chosen by the agent on 2026-09-16 and reversible while the code is small:
pnpm workspace, Vite + React 19 for the web app, vitest, one strict root tsconfig, the
`stockfish` npm package (nmrugg/stockfish.js) as the in-browser engine in a Web Worker.

## Getting started

npm 10.9.2 on this machine crashes resolving modern peer sets, so pnpm is used, through npx
(or `corepack pnpm` once corepack's cache is repaired):

```
npx pnpm@10 install      # once, and after any package.json change
npx pnpm@10 check        # tsc --noEmit over the workspace, then vitest
npx pnpm@10 dev          # web app on http://localhost:5173 (copies the wasm engine first)
npx pnpm@10 build        # production build into apps/web/dist
npx pnpm@10 screenshots  # every route at desktop, short-desktop and iPhone 13 sizes, with layout checks (docs/visual-testing.md)
```

Engine tests use the wasm Stockfish from node_modules and also a native binary when
`STOCKFISH_PATH` or /opt/homebrew/bin/stockfish exists. The browser check is
`scripts/screenshots.mjs` (Playwright, 2026-09-17): it starts its own Vite, blocks lichess.org
and chess.com at the network layer, screenshots every route at three viewports including a
phone, and fails on overflow, a primary control below the fold, sub-40px tap targets, or console
errors. Run it after any layout change; a real phone on the LAN is still the final word for iOS.

## Layout: the shared layer (A2/R1; responsibilities and mapping in memory/shared-layer.md)

- `packages/rules` — chess rules and notation: thin wrappers over chessops; the only importer of chessops.
- `packages/board` — the board UI: chessground as a React component; the only importer of chessground.
- `packages/ui` — the shared look: design tokens, native-control base styles, a handful of primitives, and the two page layouts every subproject renders inside.
- `packages/engine` — typed UCI client whose results carry provenance; Web Worker and Node transports.
- `packages/play` — opponents built on the engine: maximal resistance now, rating-calibrated later.
- `packages/positions` — curated and mined position pools, each validated by tests.
- `packages/facts` — plain-language board-state facts and questions, each answered by a chessops query; no evaluation.
- `packages/site-client` — generic one-at-a-time HTTP client factory: a serial queue, same-URL dedupe, a persisted 429 cooldown, and a localStorage TTL cache; lichess and chess.com are instances.
- `packages/lichess` — the one client for lichess.org HTTP APIs: one request in flight at a time, 429 cooldown honoured app-wide, response cache, and OAuth PKCE login whose token it attaches; every lichess call goes through it.
- `packages/chesscom` — the one client for chess.com's Published-Data API (api.chess.com): same one-at-a-time/429-cooldown/cache policy as lichess, no login needed.
- `packages/import` — games from lichess (public export API), chess.com (Published-Data API), or pasted PGN into one ImportedGame shape; parsing via rules.
- `packages/review` — per-move engine review of a game: evals, loss, classification, best move, all with provenance.
- `subprojects/<name>` — one self-standing tool each; consumes packages, never duplicates them.
- `apps/web` — the Vite app hosting every subproject behind a hash route.
- `scripts/` — repo scripts (copying the wasm engine into the web app's public folder).

Reserved package names for pieces not yet built: `tablebase`, `store`,
`concepts`, `rooms`, `srs`, `opening-tree`. Add a package only with a one-line
responsibility here and in memory/shared-layer.md.

## Conventions

- Work is organized into **subprojects** — each is a self-standing learning tool, training
  tool, or mini-game (openings builder/trainer, Chessitout mid-game trainer, endgames
  introduction, openings heuristic finder, ...).
- Prefer reusing and mirroring lichess and the open-source chess projects human-chess pulls
  from over ad-hoc choices; when you diverge, make it a deliberate, recorded decision.
- Chess rules come from the lichess-derived rules library, never re-implemented here;
  analysis comes from integrated open-source engines (user, 2026-09-15). Do not hand-write
  move generation, legality, or evaluation code — wrap what exists.

<!-- Adopted 2026-09-15 on the user's delegation from
     docs/research/2026-09-15-class-practice-chess-learning-tools.md — PRACTICE-ASSERTED
     (practitioner-reported, cited there, no outcome evidence on this project). Prose, not
     mechanically enforced. memory/adopted-practices.md holds each line's drop condition;
     remove the line there AND here when dropped. -->
- Never invent an engine evaluation, a bot move, or a game result. If an engine call fails
  or times out, say so; every number a user sees comes from a real engine or board-state
  query, and the code that shows it is traceable to that source. (A1)
- Any plain-language claim about a position (material, hanging pieces, whose move, "you're
  worse because…") is grounded in an engine or board-state query, never generated
  free-form. (V3)
- The shared layer (rules library, engine wrappers, reusable open-source code) lives in one
  named place with a one-line responsibility per top-level directory, written into memory
  before the second subproject starts; subprojects consume it and never duplicate it.
  Decompose that shared layer before parallelizing work across subprojects. (A2, R1)
- No feature ships on its author's own say-so: the code-reviewer agent, a deterministic
  check, or the user is the gate. Prose rule — nothing enforces it mechanically. (V5)
- Licensing. **The project's license is AGPL-3.0-or-later (user, 2026-09-15; text in
  LICENSE).** Anything that enters must be AGPL-compatible: GPL-3.0, MIT, BSD, Apache-2.0, CC0
  and CC BY-SA are; non-commercial (NC) content and unlicensed code are not. Compatible pieces
  are simply recorded in `memory/reuse-library.md` (license, obligation such as attribution or
  a source offer for shipped GPL wasm) when they land; no decision is needed and none is
  asked for (user, 2026-09-16). Raise it to the user only for the cases that are not settled:
  NC or unlicensed material, an inconsistent or unverifiable license, or an obligation beyond
  attribution (e.g. share-alike on data). (L2, L3, thinned 2026-09-16)

## Delegation: thin coordinator, workers on the cheaper tier (adopted 2026-09-15)

<!-- Source: ~/dev/ct-research notes/model-tiering-proposal.md (MEASURED on one external project,
     n=1, keep-verdict 2026-09-08) and its CLAUDE.md §Delegation; applied here the way autochess
     has it (2026-09-14), on the user's ask. Mechanically backed parts: settings.json sets
     autoCompactWindow=230000 and CLAUDE_CODE_SUBAGENT_MODEL=sonnet; the researcher agent pins
     model: sonnet; code-reviewer, claim-auditor and red-team pin model: inherit (they are gates).
     The delegation RULE below is prose — nothing enforces it. Falsifier: friction says a dispatch
     cost more than doing it in-thread, twice. -->

This thread is the **coordinator**. Standing authorization: dispatch **heavy-in, small-out** work
to a fresh-context subagent without asking, announce each dispatch in one line, and relay the
conclusion, not the transcript. Shapes that qualify here: a broad search across the tree or
across the open-source projects being surveyed, a long test or engine-batch run once one
exists, a research or literature pass, a license audit of a candidate library. Keep in this
thread: design discussion, edits that need surrounding context, and tight back-and-forth
iteration. **Trigger on task shape, not on "context feels large"** — delegation is not free (a
worker starts cold), so it wins for dispatchable units, not chatty shared-context work.
Subagents default to Sonnet (settings.json); the reviewer and audit agents stay on the session's
model because they are gates. **Never `Read` a subagent's `tasks/<id>.output` file** — it is the
raw JSONL transcript and reading it overflows context; use the completion notification's result.
Your own `run_in_background` command outputs under the same path are plain text and fine to Read.

## Memory system

Cross-session context lives in `memory/MEMORY.md` (the index) and individual topic files
under `memory/`. When you learn something worth keeping, write it to a topic file and add
a one-line pointer to `memory/MEMORY.md`.

- The index is loaded into every session. Mechanically backed: the SessionStart hook
  `.claude/hooks/memory_index.py` prints it into session context — this repo's `memory/`
  is the source of truth, not any editor-side memory store.
- Always update `memory/MEMORY.md` when adding or removing a topic file.
- Remove stale entries; stale memory is worse than no memory.

## Agent roles

<!-- [Conv #3, counter-pattern to wshobson/agents n=127 and ruvnet/claude-flow n=280]
     Large rosters cause overlap and trigger-collision. This harness keeps roles small.
     Three roles: researcher (chess sources), code-reviewer (correctness), /friction. -->

- `researcher` — research chess domain sources: opening theory and databases, engine
  integration, and the open-source chess projects (lichess and
  others) human-chess draws from. Does NOT write or modify code.
- `code-reviewer` — review changes for correct use of the rules library and engines (nothing
  re-implemented, nothing fabricated), safe reuse of shared code
  across subprojects, and no secret leaks. Does NOT implement features.
- `/friction` — log a decision-grade friction entry to the observe loop when something
  goes wrong. Run immediately; no ceremony.

## Observe loop

Log friction when something goes wrong:
```
/friction "description of what went wrong"
```
Entries go to `observe/observe-log.jsonl` (append-only). Passive events are logged
automatically by hooks. Decision-grade signal = /friction only.

## Guardrails

<!-- [Conv #2: regex-blocking PreToolUse rung] The Guardrails trust ladder:
     notification-only < regex-blocking PreToolUse (THIS RUNG) < sandbox.
     .claude/hooks/guard.py mechanically blocks destructive commands BEFORE they execute.
     disler/claude-code-hooks-mastery is the public exemplar for this rung.
     For human-chess, protecting the append-only observe trail and blocking destructive
     shell operations keeps a young, multi-subproject repo safe as it grows. -->

Permission baseline via `.claude/settings.json` + PreToolUse guard hook at
`.claude/hooks/guard.py`. The guard mechanically enforces:
- No recursive `rm` in any flag spelling
- No `find ... -delete`
- No `curl/wget` piped or chained into a shell
- No `sudo` / privilege escalation
- No `chmod 777`
- No detaching a process from the session (`nohup`, `disown`, `setsid`, or a trailing `&`) — run work to completion; use the Bash tool's `run_in_background` for deliberate long-running processes
- No `run_in_background` command whose last statement is a bare read/echo (`cat`/`tail`/`echo`/…) — the completion callback reports that read's exit, masking whether the real job failed; end at the redirect and Read the output file instead
- No Write/Edit to `observe/observe-log.jsonl` (audit trail is append-only)
- Matching is on PARSED commands, not raw command text — a keyword inside a quoted argument, a commit message, or a heredoc body is data, so you never need to reword a message to get past the guard
