# Adopted practices (dated, cited, revocable)

What this harness took from outside sources, when, from where, and what would show it was a
mistake. Nothing here was elicited from the user; each item was adopted on the user's
delegation ("let's go with your recommendation", 2026-09-15) from a class-practice review the
user has not yet read in full. Remove an item here AND its CLAUDE.md line when it is dropped.

## 2026-09-15 — from docs/research/2026-09-15-class-practice-chess-learning-tools.md

Tier: PRACTICE-ASSERTED (practitioner-reported, cited to the page read, no outcome evidence on
this project). The review was produced by a fresh research agent, not by the harness loop.

| Adopted | Card | Where it landed | Drop it when |
|---|---|---|---|
| Never invent an engine eval, bot move, or result; failures surface | A1 | CLAUDE.md conventions; code-reviewer | no subproject ever shows an engine-derived number to a user |
| Plain-language position claims are engine/board-state grounded | V3 | CLAUDE.md conventions; code-reviewer | explanations only ever surface the engine's own structured output, no free text |
| Shared layer named in one place, decomposed before parallel work | A2, R1 | CLAUDE.md conventions | the project becomes one monolithic app, or is only ever worked by one session at a time |
| No feature ships on its author's own say-so | V5 (+H1) | CLAUDE.md conventions (prose only) | a mechanical gate (separate reviewer session or deterministic check) makes the line redundant |
| Licensing raised by the agent, decided by the user; every reused piece of code gets its license + obligations recorded in memory/reuse-library.md before landing | L2, L3 | CLAUDE.md conventions; code-reviewer | the user picks one license for the whole project and every reused source is compatible with it, making per-item recording redundant |

Already satisfied by the emitted harness, not re-adopted: the brief says no tests exist yet
(A3); the code-reviewer agent cannot write code (the V5/H1 generator-evaluator split, in part).

Not adopted, drop condition already met by the user's answers (2026-09-15: rules come from
lichess, engines are consumed, not tuned): perft as an oracle (V1), engine-expert persona (R3),
the "core engine" half of scoping agentic coding away from engine internals (A4). Re-open V1
the day any subproject writes its own move logic.

Recorded as NEXT, not adopted (their trigger does not exist yet): played-out verification for
any quantitative strength or calibration claim — the bot-rating test subproject will make one
(V2); pack-and-install integration test once a shared package is consumed by two subprojects
(V4); agent playtests for known checks only, never open-ended sign-off (V6); read-only default
vs. explicit elevated mode for any live external platform such as the lichess API (R4, would
be wanted-but-unbacked until paths exist); documented fast-iteration path once a lint/test gate
exists (H2). Low-confidence transfer, not adopted: task-specialized agents (R2, source is
about a chess-playing agent).

LICENSING (L1–L4, doc section "Licensing & code-reuse discipline"): adopted only as a
RAISE-IT rule (above), added 2026-09-15 after the user asked whether he would have to bring
licensing up himself — before that, nothing in the harness would have. The substance — lichess
is AGPL, Stockfish/Leela/chessground/python-chess are GPL, and what that means for a persisted
library of reusable code — is the user's decision; the cards are still his to read. Also for his survey step: the doc's "Stack OPTIONS" section
(what lichess and the named projects actually use, cited, no recommendation).

## 2026-09-15 — from ~/dev/ct-research (notes/model-tiering-proposal.md + CLAUDE.md §Delegation), as applied in ~/dev/autochess

Tier: MEASURED on one external project (n=1; ~90% of output tokens in the main thread, Sonnet
workers landed more commits per output token at the same friction rate; keep-verdict 2026-09-08).
Applied on the user's ask ("is there config we did for autochess that we didn't do here?",
2026-09-15), ahead of the almanac spine question that will make this a consented default.

| Adopted | Where it landed | Mechanical? | Drop it when |
|---|---|---|---|
| autoCompactWindow = 230000 | .claude/settings.json | yes | a compaction loses something a session needed, twice |
| Subagents default to Sonnet | .claude/settings.json env CLAUDE_CODE_SUBAGENT_MODEL | yes | a Sonnet worker's output is redone on the strong tier, twice |
| researcher on Sonnet; code-reviewer, claim-auditor, red-team on inherit | agent frontmatter `model:` | yes | same as above / a gate misses what the strong tier catches |
| Thin-coordinator rule, shape-triggered | CLAUDE.md §Delegation | no (prose) | friction says a dispatch cost more than in-thread, twice |

## 2026-09-15 — user decisions that touch the table above

- Project license: AGPL-3.0-or-later (user, 2026-09-15). This meets half of the licensing row's
  drop condition (one license picked). The other half, every reused source compatible, holds
  for everything surveyed except NC content and unlicensed repos, so per-item recording in
  memory/reuse-library.md is kept for attribution and for catching those two cases. The
  CLAUDE.md line was thinned 2026-09-16 after the user asked why a CC0 lichess API was flagged
  ("I thought we already decided AGPL was sufficient"): compatible pieces are recorded only;
  only NC, unlicensed, inconsistent, or beyond-attribution obligations are raised.
- Stack: TypeScript, Rust-to-wasm for compute-heavy parts (user, 2026-09-15).

## Circle-back (due after ~10 sessions or the first subproject, whichever first)

- Did the no-fabrication and grounded-explanation lines get followed without a friction
  entry against them, once a subproject shows engine output?
- Was the shared layer written into memory before the second subproject, and did subprojects
  reuse it rather than duplicate it?
- Did the user strip any of the four lines?
- The user's own read of the research document, licensing cards included.
