# Init interview — 2026-09-15, spine v0.6, almanac init
Not complete by design: what wasn't asked was assumed. The loop corrects this file. Corrections arrive as dated appends through the review ritual — the engine never rewrites this file.

## Answered

- **Q1 premise:** An application that contains a set of chess learning, analysis, training tools, and mini-games (all referred to as subprojects). Subprojects include: Openings builder and trainer, Chessitout variant for training mid-games, endgames-focussed introduction to chess for new players, openings heuristic finder, memory trainer, vizualization trainer, test for what rating of bot you can beat from a certain opening/position, group plays chess, opening training game for who is better after N moves, game reviewer, and more. The over-arching goal is to make it easier for beginners to learn chess basics and harness advanced software tools without needing to learn a bunch of interpretation skills, as well as to provide an open-source alternative to many applications that are not free.
- **Q1 stack (elicited):** Open to suggestions, but I imagine it will be easiest if we mimic lichess' stack, as I think many open source projects we will be pulling from do this. (TENTATIVE — recorded as unsettled)
- **Q2 verification:** Checkable work, no checks built yet — setting them up early is worth agent time; Some work here is claim-shaped (research, explanations, writing) and needs review-style evaluation
- **Q3 hard limits:** The standard destructive set is enough
- **Q4 involvement:** Yes, all four carry over (carried, confirmed)
- **Q5 when it breaks:** Log it immediately, unprompted — especially its own mistakes — fix the obvious and keep working; interrupt me only when my input would change what happens (carried, confirmed)
- **Q6 cost lens:** Subscription — tokens/share of my allowance; dollars are meaningless (carried, confirmed)
- **Q7 method:** Prototype fast, iterate on what breaks (carried, confirmed)
- **Q8 the loop:** Yes — the full loop

## Assumed (unanswered or never asked)

- **Q6 budget:** SKIPPED — tokens first-class; no budget declared, so share-of-allowance readings are unavailable and threshold readings carry their invented/literature labels — never a guessed budget.
  Falsified when: the user asks what something cost in dollars.
- **A1 session-rhythm:** ASSUMED task-scoped sessions with handoffs, not marathon threads.
  Falsified when: the user marathons by preference and no friction follows.
- **A2 platform-portability:** ASSUMED capture hooks stay platform-portable (SessionEnd hooks writing plain files, never platform-native telemetry as the only source).
  Falsified when: the user declares Claude-only and a native source is strictly richer.
- **A3 deployment-mode:** ASSUMED sessions are interactive (terminal/IDE, clean exits) — what the day-one SessionEnd capture actually covers.
  Falsified when: sessions run while capture rows stall.
- **Inferred-by-generator (notation formats), kept pending user review:** Researcher scope names PGN and FEN as the chess data/notation formats to study. — NEVER elicited; the tailoring generator declared it as its own inference (self-reported), recorded here so it is not mistaken for the user's statement.
  Falsified when: "We won't use PGN/FEN — drop those from the researcher's scope."
- **Inferred-by-generator (engine integration), kept pending user review:** Researcher scope assumes a chess engine (e.g. Stockfish) will be integrated for analysis/training. — NEVER elicited; the tailoring generator declared it as its own inference (self-reported), recorded here so it is not mistaken for the user's statement.
  Falsified when: "No engine — the tools won't do engine-backed analysis."
- **Inferred-by-generator (chess-logic review), kept pending user review:** Code-reviewer assumes the app implements/validates chess rules (move legality, game-state transitions). — NEVER elicited; the tailoring generator declared it as its own inference (self-reported), recorded here so it is not mistaken for the user's statement.
  Falsified when: "We aren't writing our own chess rules engine — reviews shouldn't check move legality."

## Opt-ins (machine-readable — one stable line per surface class)

- opt-in: loop-surface (Q8, 2026-09-15)
- opt-in: claim-audit (Q2, 2026-09-15)
- opt-in: guarded-enforcement (Q3, 2026-09-15)

## Follow-ups used (0 of 3)

None.

## Verification status at init (2026-09-15)

- **Guard:** VERIFIED LIVE — blocks recursive rm and observe-log writes (exit 2) and allows 'ls' (exit 0), via direct PreToolUse payload probes.
- **Capture scripts:** VERIFIED SYNTHETICALLY — the usage hook wrote a correct row (with the by_model per-model split) from a synthetic real-transcript payload; tool-outcomes correctly skips the toolless synthetic session by design. (The one usage row is this probe, not hook-fired.)
- **SessionEnd capture end-to-end:** PENDING FIRST INTERACTIVE SESSION **STARTED AFTER THIS EMISSION** — SessionEnd firing cannot be verified headlessly on a fresh target (headless probes fire hooks inconsistently pre-trust). CHECK AT FIRST SUCH SESSION: after an interactive session that BEGAN after the harness landed exits cleanly, observe/usage-log.jsonl must gain a row. If a clean exit produces none, that is the A3 tripwire — investigate. Rows are NOT expected from the session that installed the harness: hooks load at session start, so that session never had them (crypto-vizuals, 2026-07-31, where zero rows read as a capture failure and was not one).

> NOTE — none of this is live yet. Claude Code loads CLAUDE.md, rules, hooks and commands at SESSION START, so a harness installed mid-session does nothing for the rest of that session: no guard, no capture, no /friction, no project brief. Start a new session in this directory before relying on any of it, and treat work done in the meantime as unharnessed.

## Run deviations (protocol material, recorded for mechanization)

- Target directory did not exist; interviewer created ~/dev/human-chess and ran `git init` at the user's instruction ('does not exist, you will create it') before detect-fresh.
- Q1 six-week success signal was not given; interviewer offered deferral in the beat-2 prompt rather than a follow-up, and it stayed deferred.
- Fresh-repo detected (empty tree — no source files, no manifest) — Q2 option (a) dropped and the tailoring ran in fresh-project mode.

## 2026-09-15 — user corrections after emission (appended by the interviewer, same day)

- **Inferred-by-generator (engine integration): CONFIRMED by the user** — "We will be integrating open-source analysis engines yes." Now elicited, no longer an inference.
- **Inferred-by-generator (chess-logic review): FALSIFIED by the user** — "I assume we will be implementing chess rules by taking from lichess rather than implementing them ourselves." The code-reviewer charter and the CLAUDE.md agent-roles line were edited from "correct chess logic / move legality" to "correct use of the lichess-derived rules library and engines, nothing re-implemented"; a conventions line records the user's statement.
- **Inferred-by-generator (notation formats: PGN and FEN): DROPPED** — the user: "That is not a harness concern but an implementation concern." Removed from the researcher charter and the CLAUDE.md agent-roles line. The lesson is about the generator, not the guess: implementation detail (which formats, which libraries) does not belong in harness prose at all, and should not have been put to the user as a harness decision.
- **Fidelity fix:** the emitted brief and memory topic had listed four of the ten subprojects the user named and renamed "openings heuristic finder" to "trainer"; both now carry the user's own list (grounded in docs/goals.md, the verbatim Q1 answer). Logged as almanac friction (an emission-gate gap, not a target defect).
- **Class-practice review adopted in part** on the user's delegation ("let's go with your recommendation"): four practices into CLAUDE.md conventions + code-reviewer, recorded with drop conditions in memory/adopted-practices.md; the four licensing cards are reserved for the user's own read and nothing from them was applied. All PRACTICE-ASSERTED; none is mechanically enforced.
