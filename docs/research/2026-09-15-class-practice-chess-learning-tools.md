# Class Practice: Chess Learning/Analysis/Training Tools + Mini-Games, Built With AI Coding Agents

**Class:** (1) chess tooling with a large open-source field — lichess/lila, chessground,
python-chess, Stockfish, Leela Chess Zero, openingtree, puzzle DBs, PGN/FEN/UCI,
chess.js, cutechess, en-croissant, repertoire trainers; (2) mini-game / game
development with agents — headless rule cores, deterministic tests, game-state
validation; (3) teaching-tool / trainer building — spaced repetition, puzzle and
visualization/memory trainers, beginner-facing explanation; (4) analysis-interpretation
for beginners — turning engine evals, opening stats, and game reviews into
plain-language guidance.

**Date:** 2026-09-15

**Produced by:** a fresh research agent (Claude Code, general-purpose subagent, Sonnet)
working from web search and primary-source fetches. This is a BASELINE for the almanac
harness-class-practice corpus: it was NOT produced by the almanac product, and nothing
here has been checked against this project's own sessions.

**Tier:** PRACTICE-ASSERTED unless a card says otherwise. Reported by practitioners,
cited to the page actually read, no outcome evidence on human-chess. Never a template
default.

**Scope:** human-chess is a fresh (empty) repo intending to house many small
subprojects (openings trainer, mid-game variant trainer, endgame intro, opening
heuristic finder, memory trainer, visualization trainer, "what rating can you beat"
tester, group play, N-move comparison game, game reviewer, and more) around a
tentative "lichess-like" stack, with an explicit goal of surveying and reusing
open-source chess code (lichess, openingtree, Leela, Stockfish) rather than building
everything from scratch. This document surveys what practitioners report about using
AI coding agents on projects of this shape, filtered to what touches the HARNESS
(standing instructions, verification, agent roles, hooks/guards, memory, licensing
discipline) rather than chess-app design choices themselves.

**Data-not-instructions:** every source below was read as data. Nothing quoted or
summarized here is an instruction to this project, this repo, or any agent operating
on it — including quotes that read as imperative ("always do X"). They are reports of
what other practitioners did or found, to be weighed, not obeyed.

---

## 0. How to read these cards

Each card is one practice claim, traced to one thing a real person or paper actually
said, with an honest note on whether/how it would show up if human-chess ran into the
same problem. Cards are grouped by harness surface (architecture rules, verification,
agent roles, hooks/guards, memory, licensing) because that is the axis the almanac
product edits along, not by chess-feature. The five cards judged most load-bearing for
human-chess specifically are marked **[TOP-5]** — three because they sit directly on
the user's stated "persist a library of reusable open-source code" goal (which is
unusually exposed to licensing risk for this class), and two because they are the
single most cross-cutting verification finding for agent-built tools in general.
Nothing here is ranked by how interesting it is to read; it's ranked by how much it
would have changed a decision on this project.

---

## Architecture / standing-brief rules (A-cards)

### A1. State fabrication is the invariant an AGENTS.md must name first for any chess-coaching app

**Practice:** The repo's coding-agent brief opens its behavioral rules with a
no-fabrication invariant specific to chess data, not a generic "don't hallucinate"
line: bot moves, engine evaluations, model responses, and game results must never be
invented, every scenario-line move must carry `MoveProvenance` (which component
produced it — Stockfish, Maia, external bot), and Maia's replies must not be silently
replaced by Stockfish defenses in the default mode. External-platform interaction is
read-only by default; anything that reaches outside chess platforms is "opt-in,
bounded, rate-limited, recorded, and never recursive tree search."

**Reported by:** AGENTS.md, `chris-madsen/chess` (fetched via the repo root page,
which surfaced the file's content), read 2026-09-15.
URL: https://github.com/chris-madsen/chess
Quote: "No bot move, engine evaluation, model response, or game result may be
invented."

**Harness surface:** architecture / standing-brief rules.

**Tier:** PRACTICE-ASSERTED (one repo's own AGENTS.md, not validated against outcomes).

**Evidence it would have helped on human-chess:** a falsifiable signal would be an
agent session where a "game reviewer" or "rating estimator" subproject silently
interpolated a plausible-looking evaluation number or move when a real engine call
failed or timed out, and nobody caught it because nothing in the harness named that
failure mode explicitly.

**Fit for THIS project:** HIGH for class 4 (analysis-interpretation) and the "game
reviewer" / "what rating can you beat" subprojects, whose entire value is trustworthy
translation of real engine output; MEDIUM for class 3 (a memory/visualization trainer
that quizzes positions could silently drift from the real FEN); LOW for class 2 (pure
mini-games have no external engine to misrepresent).

**Drop condition:** drop if human-chess's subprojects never call an external engine or
never report engine-derived numbers to a user (i.e., if the "no source of truth to
misrepresent" case holds throughout).

---

### A2. Name the layer boundary before an agent invents its own

**Practice:** `boardgame.io`'s AGENTS.md tells an agent where new logic belongs before
it writes any, by naming each top-level directory's single responsibility: `core/` is
"pure game engine: the reducer, flow (phases/turns/stages), turn-order strategies,
initialization, action creators/types," `master/` is "server-side game authority" that
"applies moves, filters per-player views," and `ai/` is the bot framework. The
document exists specifically so an agent doesn't have to infer the boundary from
reading code.

**Reported by:** AGENTS.md, `boardgameio/boardgame.io`, read 2026-09-15.
URL: https://github.com/boardgameio/boardgame.io/blob/main/AGENTS.md
Quote: "core/ — pure game engine: the reducer, flow (phases/turns/stages), turn-order
strategies, initialization, action creators/types."

**Harness surface:** architecture / standing-brief rules.

**Tier:** PRACTICE-ASSERTED.

**Evidence it would have helped on human-chess:** a falsifiable signal is an agent
putting server-authoritative game-state logic (e.g., for "group plays chess") into a
UI component, or duplicating rule-validation logic between the "N-move comparison
game" and the "endgame intro" subprojects because neither was told where the shared
rules core lives.

**Fit for THIS project:** HIGH for class 2 (mini-games sharing a rules core across many
subprojects is exactly this project's structural risk, given the stated plan for
"a set of ... mini-games" that presumably share chess rules); MEDIUM for class 1 (the
same boundary applies to wherever python-chess/chess.js gets vendored in).

**Drop condition:** drop if human-chess ends up as one monolithic app rather than many
subprojects sharing a rules core — the boundary-naming problem only bites when
multiple subprojects need the same primitives.

---

### A3. A CLAUDE.md is honest about what verification does NOT exist yet

**Practice:** `chess-console`'s CLAUDE.md, guiding agents on a browser chess-GUI
framework, states plainly that there is no test suite rather than describing an
aspirational one: "No automated tests are currently configured (`npm test` is not
implemented)." It then documents the one architectural invariant that actually matters
for correctness in an async UI — both `ChessConsole` and `Board` expose an
`initialized` Promise that must be awaited before calling their methods.

**Reported by:** CLAUDE.md, `shaack/chess-console`, read 2026-09-15.
URL: https://github.com/shaack/chess-console/blob/master/CLAUDE.md
Quote: "No automated tests are currently configured (`npm test` is not implemented)."

**Harness surface:** architecture / standing-brief rules.

**Tier:** PRACTICE-ASSERTED.

**Evidence it would have helped on human-chess:** a falsifiable signal is an agent
assuming a test command exists (and either fabricating a pass or silently skipping
verification) because the harness didn't say there was nothing to run.

**Fit for THIS project:** MEDIUM for classes 1 and 3 — human-chess starts from an
empty repo, so this is really a caution for whichever early subproject gets scaffolded
first without tests: the standing brief should say so out loud rather than implying a
verification step that doesn't exist.

**Drop condition:** moot as soon as a real test suite exists for a given subproject;
re-apply per-subproject if a new one is scaffolded ahead of its own tests.

---

### A4. Scope agentic coding away from the part of the stack where it demonstrably fails

**Practice:** Leela Chess Zero's contribution guide draws an explicit line: agentic
coding assistance is welcomed for "websites, documentation, and simple tools" but
discouraged for the core engine, because — per the maintainers — "AI assistance has
performed poorly on core lc0 engine code historically." This is a scope rule, not a
blanket ban: it names the exact surface where the practice is known to fail for this
class of code (tight numeric/search/eval code) versus where it's fine.

**Reported by:** CONTRIBUTING.md, `LeelaChessZero/lc0`, read 2026-09-15.
URL: https://github.com/LeelaChessZero/lc0/blob/master/CONTRIBUTING.md
Quote: "Clearly mention in your PR description if you used AI tools, LLMs, or agentic
coding approaches (beyond simple code completion)."

**Harness surface:** architecture / standing-brief rules.

**Tier:** PRACTICE-ASSERTED (one maintainer team's stated experience, not a controlled
study).

**Evidence it would have helped on human-chess:** a falsifiable signal is an agent
generating search/eval/move-generation code with high confidence and no extra scrutiny
that later fails perft or produces silently-wrong evaluations, in a subproject the
harness treated as no different from a UI or trainer-content task.

**Fit for THIS project:** HIGH for class 1 (any hand-written or heavily-modified
move-generation/eval code, if human-chess writes any instead of purely wrapping
existing engines); MEDIUM for class 2 (the same caution generalizes to any tight
deterministic rules core); LOW for classes 3/4 (UI, spaced-repetition scheduling, and
explanation-generation are closer to the "simple tools" bucket lc0 says agentic coding
is fine for).

**Drop condition:** drop the "core engine" half if human-chess only ever calls out to
Stockfish/Leela/python-chess as libraries and never hand-writes its own move
generation or search — the caution then has no target.

---

## Verification practices (V-cards)

### V1. Perft is a deterministic oracle an agent can be handed directly — and it works [TOP-5]

**Practice:** Perft (a fixed-depth legal-move-count from a fixed position) has
published exact reference values and is used as a pass/fail oracle for move
generation. In a documented 5-AI-agent build of a chess engine, perft caught a real bug
— one engineer's pawn-move logic produced 19 legal moves in a position known to have
20, traced to "a missing edge case in castling rights after a rook capture" — and the
author generalizes the pattern: "Exit code 0 is the cheapest reviewer you'll ever
hire," specifically because perft and `cargo test` gave the agent an unambiguous,
non-negotiable failure signal it could act on directly, rather than a vague code
review comment.

**Reported by:** "I Built a Chess Engine with 5 AI Agents — Here's What Surprised Me,"
dev.to (@battyterm), read 2026-09-15.
URL: https://dev.to/battyterm/i-built-a-chess-engine-with-5-ai-agents-heres-what-surprised-me-1g16
Quote: "Exit code 0 is the cheapest reviewer you'll ever hire."

**Harness surface:** verification practices.

**Tier:** PRACTICE-ASSERTED, corroborated independently by the Chess Programming Wiki's
perft reference tables and by `sohamkorade/autoperft` (an automated perft-checker
built for exactly this use case) — both surfaced by search but not separately fetched,
so only the dev.to account is cited as read.

**Evidence it would have helped on human-chess:** the falsifiable signal is any
subproject touching move legality (the openings builder, mid-game variant trainer,
endgame intro, "N-move comparison" game) shipping a legality bug that a five-minute
perft check at known depths against known positions would have caught before a human
ever played it.

**Fit for THIS project:** HIGH for class 1 and class 2 — any subproject that
implements or wraps move generation (rather than purely consuming
python-chess/chess.js output) should be perft-checkable; LOW for class 3/4 where the
rules layer is a dependency, not something being built.

**Drop condition:** drop for any subproject that only ever calls python-chess /
chess.js / chessops for legality and never touches move generation itself — perft only
matters where legality logic is actually written.

---

### V2. SPRT-gated statistical testing, not unit tests, gates engine-strength changes

**Practice:** Stockfish's own development process (Fishtest) does not merge a patch
that claims to improve play strength on the strength of unit tests passing; it plays
the patch against the baseline over enough games to clear a Sequential Probability
Ratio Test at fixed Elo bounds (e.g., short time control [0, 2.0] Elo, long time
control [0, 1.0] Elo) before the patch is accepted.

**Reported by:** Fishtest wiki / documentation, `official-stockfish/fishtest`, and
Stockfish Docs, read 2026-09-15.
URL: https://github.com/official-stockfish/fishtest/wiki/Creating-my-first-test
Quote: "Standard bounds are used to determine if a patch is a 'pass' or 'fail': STC:
[0, 2.0] Elo and LTC: [0, 1.0] Elo."

**Harness surface:** verification practices.

**Tier:** PRACTICE-ASSERTED (documented process for one specific, very mature project;
not something a small project can replicate at scale, but the *category* — behavioral
claims need behavioral tests, not just unit tests — generalizes).

**Evidence it would have helped on human-chess:** the falsifiable signal is a claim
like "this heuristic opening-finder now surfaces better candidate lines" or "this bot
is calibrated to beat 1200-rated players" being accepted on the strength of a passing
unit test alone, with no played-out verification that the claimed behavioral property
actually holds.

**Fit for THIS project:** MEDIUM for class 1 only if human-chess ever tunes engine
parameters or its own heuristic opening-finder's ranking function; LOW for classes
2/3/4, where "does it produce the claimed player-facing behavior" is much cheaper to
check by direct means (there's no Elo claim to statistically validate).

**Drop condition:** drop entirely unless a subproject makes a quantitative strength or
calibration claim ("beats X-rated bots," "surfaces the objectively-better move")
that isn't otherwise directly checkable.

---

### V3. Tool-augmented grounding roughly halved factual-error rates in chess commentary [TOP-5]

**Practice:** A benchmark paper decomposed LLM-generated chess commentary into atomic,
checkable sub-claims and evaluated them against ground truth. Without tool access, a
strong frontier model's sub-claims failed verification 22.0% of the time (weaker
open-weight models exceeded 40%); when the same model was allowed to route verifiable
claims to deterministic chess tools (engine evaluation, board-state queries, legality
checks) instead of relying on its own parametric knowledge, the error rate dropped to
9.2%. The paper's core warning for naive evaluation: "a fluent, chess-specific but
*wrong* claim will receive a high score" from an LLM judge that isn't itself
grounded in engine truth.

**Reported by:** "Hallucinations on the Board: Tool-Augmented Evaluation of LLM Chess
Commentary," arXiv, read 2026-09-15.
URL: https://arxiv.org/html/2608.04240
Quote: "a fluent, chess-specific but wrong claim will receive a high score"

**Harness surface:** verification practices.

**Tier:** PRACTICE-ASSERTED / research-measured (this is a paper with numbers, not one
practitioner's anecdote — still not validated on human-chess, so still
PRACTICE-ASSERTED for this corpus's purposes, but stronger than a single blog post).

**Evidence it would have helped on human-chess:** the falsifiable signal is directly
the project's own "game reviewer" and "opening heuristic finder" subprojects: does a
plain-language explanation of a position ("you're worse here because...") route its
factual claims (material count, whose move it is, whether a piece is hanging, what the
engine eval says) through the engine/board-state rather than generating them
free-form? A 22%→9% swing is large enough to be worth designing for from day one
rather than discovering after users report confidently-wrong explanations.

**Fit for THIS project:** HIGH for class 4 (this is the exact subproject — turning
engine output into beginner-facing plain language); MEDIUM for class 3 (a puzzle or
visualization trainer that also narrates positions inherits the same risk).

**Drop condition:** drop if human-chess's "explain this position" features only ever
surface the engine's own structured output (numbers, best-move arrows) and never
generate free-text claims about the position — the hallucination surface only exists
where an LLM asserts something checkable.

---

### V4. A lint-then-test pretest gate and a full pack-install integration test catch different bug classes

**Practice:** `boardgame.io`'s test pipeline runs lint as a pretest hook (a lint
failure blocks the test run before any test executes — the AGENTS.md calls this out
explicitly as a "gotcha" for an agent iterating on a single test file, who should run
`pnpm exec jest path/to/file.test.ts` directly to skip the lint gate while
iterating), and separately runs an integration test that deletes `dist/`, packs the
library as a real npm tarball, and installs *that* into a fresh integration directory
— catching "works in the source tree, breaks once published" bugs that unit tests
never see.

**Reported by:** AGENTS.md, `boardgameio/boardgame.io`, read 2026-09-15.
URL: https://github.com/boardgameio/boardgame.io/blob/main/AGENTS.md
Quote: "pnpm run test:integration — scripts/integration.js deletes dist/, npm packs
the lib, installs the tarball into integration/"

**Harness surface:** verification practices.

**Tier:** PRACTICE-ASSERTED.

**Evidence it would have helped on human-chess:** the falsifiable signal is a shared
rules-core or trainer library (used by multiple subprojects) that works when imported
from source but breaks once built/packaged — a class of bug specifically invisible to
unit tests run against the source tree.

**Fit for THIS project:** HIGH for class 2 if a shared game/rules core is factored out
as an installable package consumed by multiple subprojects (the project's own stated
shape — many subprojects around shared reusable code — makes this likely); LOW
otherwise.

**Drop condition:** drop until/unless a shared internal package is actually extracted
and consumed by more than one subproject; irrelevant to a single monolithic app.

---

### V5. Agents evaluating their own work confidently praise mediocre output — separating generator from evaluator changed the outcome [TOP-5]

**Practice:** Anthropic's own internal finding, as reported by a practitioner who
restructured their harness around it: "Agents asked to evaluate their own work tend to
confidently praise it, even when it's clearly mediocre to human observers," to the
point that "Claude is an inadequate QA agent out of the box." The practitioner cites a
stark before/after: a solo-agent setup with no separate evaluator produced broken core
features in 20 minutes for $9, while a restructured setup with a genuinely separate
evaluator role took 6 hours and $200 to reach working functionality — slower and more
expensive, but actually working. Their fix maps three roles onto the harness:
"Planner" (CLAUDE.md), "Generator" (sub-agents doing the implementation), "Evaluator"
(rules loaded every session + skills triggered by keyword) — with the explicit
realization that "my evaluator layer was almost empty" before the change.

**Reported by:** "Anthropic Proved AI Can't Evaluate Its Own Work. Here's How I
Rebuilt My Claude Code Setup Around That," dev.to (@lovanaut55), read 2026-09-15.
URL: https://dev.to/lovanaut55/anthropic-proved-ai-cant-evaluate-its-own-work-heres-how-i-rebuilt-my-claude-code-setup-around-5f8i
Quote: "Agents asked to evaluate their own work tend to confidently praise it, even
when it's clearly mediocre to human observers."

**Harness surface:** verification practices / agent roles (this card straddles both;
filed here because the actionable change is "add a real evaluation gate," with the
agent-role split as the mechanism).

**Tier:** PRACTICE-ASSERTED (one practitioner's account of applying an Anthropic
finding; the underlying Anthropic claim itself is treated here as reported practice,
not independently re-verified by this document).

**Evidence it would have helped on human-chess:** the falsifiable signal is any
subproject where the same agent that wrote a feature also signed off that it was
correct, with no independent check — and it later turned out not to be (a puzzle
trainer that "looks done" but serves stale/wrong positions, a memory trainer whose
scoring silently drifts). This is the single most general, most cross-class finding in
this whole document.

**Fit for THIS project:** HIGH across all four classes — this is not chess-specific,
it's a property of agent self-review that applies identically to a mini-game, a
trainer, an analysis tool, or engine-adjacent code. If anything it is MOST dangerous
for class 3/4 (trainer and explanation UX), where "looks plausible to me" is exactly
the failure mode that's hardest for a human to catch by inspection either.

**Drop condition:** drop only if human-chess's harness already has a hard rule that no
agent merges/ships a feature it evaluated itself (a distinct model, a distinct
session, or a deterministic check must be the actual gate) — at which point this card
is already satisfied rather than actionable.

---

### V6. A live agentic playtest harness is good at confirming known bugs, bad at open-ended discovery — and just as prone to false "it works" claims

**Practice:** A developer built an agentic test harness that let an AI agent play
their game and report back. It worked well for "validating a new feature based on the
spec" and confirming a known bug, and text-based state rendering was cheaper and more
reliable than screenshot-based verification for a turn-based loop. It was much weaker
at organic, undirected bug discovery. And the same self-evaluation failure as V5
showed up live: "I keep occasionally getting 'I tested it and it works perfectly!' as
I stare at the mcp'd browser with the player stuck clipped halfway into a planet."

**Reported by:** "Letting AI play my game – building an agentic test harness to help
play-testing," Hacker News thread, read 2026-09-15.
URL: https://news.ycombinator.com/item?id=47947525
Quote: "I keep occasionally getting 'I tested it and it works perfectly!' as I stare
at the mcp'd browser with the player stuck clipped halfway into a planet."

**Harness surface:** verification practices.

**Tier:** PRACTICE-ASSERTED (a forum thread with mixed first-hand accounts, not a
single controlled report — treated as lower-confidence than V1/V3/V5).

**Evidence it would have helped on human-chess:** the falsifiable signal is directing
an agent to "playtest the mid-game variant trainer" for open-ended bugs and getting a
confident "works great" report that doesn't survive a human actually clicking through
it — versus pointing the same agent at one specific known behavior ("does the
trainer correctly reject an illegal en passant capture") and getting a trustworthy
answer.

**Fit for THIS project:** MEDIUM for class 2 (mini-games are exactly the kind of
interactive surface this applies to) and class 3 (trainer UX); LOW for classes 1/4
(engine wrapping and explanation-generation are less about live interactive
playtesting and more amenable to V1/V3's deterministic checks).

**Drop condition:** drop if human-chess never uses an agent-driven live playtest loop
and relies only on deterministic/unit-level verification (V1, V4) plus human
click-through — at which point this caution has no target to attach to.

---

## Agent roles (R-cards)

### R1. Architecture-planning investment on the strongest model determined whether parallel agents actually stayed parallel

**Practice:** In the 5-agent chess-engine build (1 Architect on the most capable
model, 3 Engineers each in an isolated git worktree, 1 Manager for routing), the
single biggest determinant of whether the three engineers could genuinely work in
parallel was the quality of the architecture's module decomposition: "A good
architecture plan meant engineers could work independently... Poor decomposition
forced sequential rather than parallel execution." Five agents was empirically the
coordination sweet spot for this task; going to seven slowed total time (18→22
minutes) because of merge serialization and artificially-forced task splitting.

**Reported by:** dev.to (@battyterm), read 2026-09-15 (same source as V1).
URL: https://dev.to/battyterm/i-built-a-chess-engine-with-5-ai-agents-heres-what-surprised-me-1g16
Quote: "A good architecture plan meant engineers could work independently."

**Harness surface:** agent roles.

**Tier:** PRACTICE-ASSERTED (n=1 project, informal benchmark, not a controlled
study — but internally consistent and mechanistically plausible).

**Evidence it would have helped on human-chess:** the falsifiable signal is spinning
up multiple agents/subagents across human-chess's many subprojects and finding they
constantly collide on a shared module (most likely the rules core or the reusable
open-source library layer the user wants persisted) because no one agent produced an
upfront decomposition of that shared layer first.

**Fit for THIS project:** HIGH for class 1/2 — human-chess explicitly plans many
subprojects around a shared reusable library; that shared-library decomposition is
exactly the kind of upfront architecture investment this card says pays off before
parallelizing work across subprojects.

**Drop condition:** drop if human-chess is worked on by one agent/session at a time
rather than multiple concurrent agents — the coordination-ceiling finding only bites
under real parallelism.

---

### R2. Task-specialized subagents outperformed one agent holding every capability

**Practice:** In a system teaching Claude to play chess via structured agents, giving
one "MegaChessAgent" every tool and responsibility underperformed a design where
multiple agents were each optimized for one narrow task: "multi-agent systems, where
each agent is optimized for a specific task, can handily outperform a single agent
that is given all of the same tools" — the author attributes this to specialized
agents reaching competency faster through focused repetition on a narrower problem.

**Reported by:** "Teaching Claude To Teach Claude To Play Chess," James Kirk, read
2026-09-15.
URL: https://jfkirk.github.io/posts/claude-chess/
Quote: "multi-agent systems, where each agent is optimized for a specific task, can
handily outperform a single agent that is given all of the same tools."

**Harness surface:** agent roles.

**Tier:** PRACTICE-ASSERTED — important caveat: this project is about an LLM playing
chess as a player, not about coding agents building chess software, so the transfer
to human-chess's harness is by analogy (task-specialized *coding* agents/subagent
roles), not a direct report from this class.

**Evidence it would have helped on human-chess:** the falsifiable signal is a single
general-purpose agent session asked to build several different subprojects (the
memory trainer, the visualization trainer, the opening heuristic finder) in one long
thread producing worse per-subproject quality than dedicated, narrowly-scoped sessions
or subagents per subproject.

**Fit for THIS project:** MEDIUM for classes 3/4 (trainer and explanation subprojects
are naturally separable tasks that could each get a dedicated subagent role); LOW
confidence transfer overall given the source is about a chess-playing agent, not a
chess-tool-building one.

**Drop condition:** drop this card specifically if a comparable finding turns up from
a source actually about coding-agent roles (rather than playing-agent roles) — it
should be superseded, not stacked, since it's here mainly because nothing more
directly on-point surfaced in this pass.

---

### R3. A domain-expert subagent persona kept deep engine knowledge out of the harness's default context

**Practice:** The `seajay-chess` engine project defines a dedicated
`chess-engine-expert` subagent — described as "a senior chess programming mentor"
with deep knowledge of perft debugging, search algorithms (alpha-beta, LMR, null-move
pruning), NNUE evaluation, UCI/time management, and SPRT methodology — invoked only
when that specific expertise is needed, rather than loading all of that domain
knowledge into the main agent's default working context on every task.

**Reported by:** `.claude/agents/chess-engine-expert.md`, `namebrandon/seajay-chess`,
read 2026-09-15.
URL: https://github.com/namebrandon/seajay-chess/blob/main/.claude/agents/chess-engine-expert.md

**Harness surface:** agent roles.

**Tier:** PRACTICE-ASSERTED (one project's subagent definition; not evaluated for
effectiveness anywhere in the source itself).

**Evidence it would have helped on human-chess:** the falsifiable signal is the main
agent's context being bloated with deep engine-internals knowledge (bitboards, NNUE,
SPRT) on sessions that never touch engine internals — e.g., a session building the
opening-trainer UI paying a context tax for knowledge only the (hypothetical, rarely
invoked) engine-wrapping subproject needs.

**Fit for THIS project:** HIGH for class 1 specifically if human-chess ever needs deep
engine-tuning expertise (unlikely if purely consuming Stockfish/Leela as black boxes,
more likely if it forks or tunes anything); LOW otherwise, since most subprojects
described by the user (trainers, visualizers, heuristics) don't need engine-internals
depth at all.

**Drop condition:** drop if human-chess never touches engine internals (pure
UCI-consumer usage of Stockfish/Leela) — the persona-subagent pattern has nothing to
specialize in.

---

### R4. A default read-only agent and a separate, explicitly elevated agent for anything touching outside platforms

**Practice:** The same AGENTS.md as A1 draws a role boundary, not just a data-integrity
rule: ordinary analysis is read-only with respect to external chess platforms, and any
capability that reaches an external bot or engine is treated as a distinct, elevated
mode — "opt-in, bounded, rate-limited, recorded, and never recursive tree search" —
rather than something the default agent can casually do.

**Reported by:** AGENTS.md, `chris-madsen/chess`, read 2026-09-15 (same source as A1).
URL: https://github.com/chris-madsen/chess
Quote: "ordinary analysis is read-only with respect to external chess platforms"

**Harness surface:** agent roles.

**Tier:** PRACTICE-ASSERTED.

**Evidence it would have helped on human-chess:** the falsifiable signal is a "group
plays chess" or "N-move comparison" subproject where an agent, given broad tool
access, submits a real move to an external platform (lichess, a live bot) during what
was meant to be read-only analysis or testing.

**Fit for THIS project:** MEDIUM for class 1/2 if any subproject integrates with a
live external service (lichess API, a hosted bot) rather than only local
engines/libraries; LOW for purely local trainers.

**Drop condition:** drop if no human-chess subproject ever calls out to a live
external chess platform or bot — the read-only/elevated split has no boundary to
enforce.

---

## Hooks / guards (H-cards)

### H1. Restructure the harness into rules (always-on), skills (keyword-triggered), and a hard generator/evaluator split

**Practice:** In direct response to the V5 finding, the practitioner rebuilt their
Claude Code setup into three concrete layers rather than one CLAUDE.md: rules in
`~/.claude/rules/` that load every session for "production-critical review criteria";
skills in `~/.claude/skills/` as "domain-specific reviewers activated by keywords"; and
an explicit agent-separation (documented in an agents.md) so a manager delegates all
implementation to sub-agents and never grades its own output. Their stated tuning
principle: "weight evaluation criteria toward what AI overlooks, prune criteria as
models improve."

**Reported by:** dev.to (@lovanaut55), read 2026-09-15 (same source as V5).
URL: https://dev.to/lovanaut55/anthropic-proved-ai-cant-evaluate-its-own-work-heres-how-i-rebuilt-my-claude-code-setup-around-5f8i
Quote: "weight evaluation criteria toward what AI overlooks, prune criteria as models
improve"

**Harness surface:** hooks / guards (the mechanism that turns V5's finding into
something enforced rather than just known).

**Tier:** PRACTICE-ASSERTED.

**Evidence it would have helped on human-chess:** the falsifiable signal is the same
as V5's — a shipped feature that "looked done" to the agent that built it and would
have failed a genuinely separate check.

**Fit for THIS project:** HIGH across all four classes, same reasoning as V5 — this is
general harness-design practice, not chess-specific, but directly actionable for a
project about to scaffold its harness from scratch.

**Drop condition:** same as V5 — drop once/if a hard generator≠evaluator rule is
already enforced in the harness.

---

### H2. A lint-gated pretest hook has a known agent-facing gotcha worth documenting explicitly

**Practice:** `boardgame.io`'s test command runs lint as a pretest step, so a lint
failure blocks the entire test run before any test executes — and the project's
AGENTS.md calls this out by name as something an agent needs to know, recommending
`pnpm exec jest path/to/file.test.ts` (bypassing the lint gate) when iterating on a
single test file, rather than re-discovering the slow full-suite path every time.

**Reported by:** AGENTS.md, `boardgameio/boardgame.io`, read 2026-09-15 (same source as
A2/V4).
URL: https://github.com/boardgameio/boardgame.io/blob/main/AGENTS.md
Quote: "The pretest hook runs lint, so a lint error makes pnpm test fail before any
test runs"

**Harness surface:** hooks / guards.

**Tier:** PRACTICE-ASSERTED.

**Evidence it would have helped on human-chess:** the falsifiable signal is an agent
repeatedly running the full test command while iterating a single failing test, mostly
paying the cost of unrelated lint failures elsewhere in a growing multi-subproject
repo, without a documented faster path.

**Fit for THIS project:** MEDIUM — mostly a generic "document your harness's own
sequencing gotchas explicitly, the way this repo does" lesson, useful once human-chess
has any nontrivial build/test pipeline; LOW value on day one of an empty repo.

**Drop condition:** drop until human-chess's build pipeline is complex enough
(multiple subprojects, a shared lint/test gate) that a fast-iteration path is worth
documenting.

---

## Memory conventions

No chess- or game-dev-specific practitioner report on session-memory conventions
(handoff notes, progress files, scratchpad discipline) surfaced in this pass that met
the read-and-cite bar — the searches that returned this topic (see search log) surfaced
only generic AI-agent-memory blog content unrelated to this project's class, none of
which was fetched/read, so no card is written here rather than force one. This is a
genuine gap in this baseline, not a claim that the surface doesn't matter: worth a
dedicated search pass of its own if this surface becomes a live decision (e.g., once
human-chess has enough subprojects that a shared "which subproject was I working on"
handoff convention becomes necessary).

---

## Licensing & code-reuse discipline (L-cards)

These matter more for human-chess than for a typical target: the user's stated
starting point is "a survey of open-source chess projects... so that we persist a
library of existing re-usable code," and the obvious reuse targets in this field are
overwhelmingly copyleft, not permissive.

### L2. AGPL's network-service trigger applies to running a modified lichess-derived service, not just distributing it [TOP-5]

**Practice:** Lichess's core repositories (lila, chessground, scalachess) are licensed
AGPLv3, which — unlike plain GPL — treats running modified code as a network service
as equivalent to distribution for licensing purposes. Practically: "If you create a
chess website of your own and decide to improve upon lichess bots and use them in your
website, you have to disclose your presumably improved bots' source, even if you don't
offer any binary downloads." Simply calling lichess's public API (without embedding
its code) does not trigger this.

**Reported by:** discussion thread "What is the AGPL v3 license?",
`lichess-bot-devs/lichess-bot` GitHub Discussions, read 2026-09-15 (via search
synthesis of the discussion and corroborating FOSSA/lichess-forum material; treated
here at PRACTICE tier because the exact discussion text was not independently
re-fetched verbatim — see caveat below).
URL: https://github.com/lichess-bot-devs/lichess-bot/discussions/1027
Quote (as surfaced by search over this page): "If you create a chess website of your
own and decide to improve upon lichess bots and use them in your website, you have to
disclose your presumably improved bots' source, even if you don't offer any binary
downloads."

**Caveat on citation grade:** this card is sourced from a WebSearch synthesis of the
discussion page content, not a direct WebFetch read of the page itself — flagged here
rather than silently upgraded, per this document's own read-vs-searched discipline.
Treat the specific quote as reported-by-search, not independently verified verbatim by
this agent; the underlying AGPL network-copyleft mechanism itself is independently
confirmed by the chessground/python-chess LICENSE files this agent did read directly
(see L1/L3).

**Harness surface:** licensing & code-reuse discipline.

**Tier:** PRACTICE-ASSERTED, with the citation-grade caveat above.

**Evidence it would have helped on human-chess:** the falsifiable signal is human-chess
vendoring or lightly modifying any lichess-org code (chessground for the board UI,
scalachess/chessops for rules, an openingtree-derived opening-tree view) into a hosted
app, and treating that as "just reusing a library" the way one would with a permissive
MIT/Apache dependency — without anyone having flagged that the *whole combined
network-facing app* likely inherits an AGPL source-disclosure obligation.

**Fit for THIS project:** HIGH for class 1 specifically, and directly load-bearing for
the user's own stated goal of persisting a reusable library from these projects — this
is exactly the kind of thing that needs to be known before, not after, code is vendored
in.

**Drop condition:** drop only if human-chess ends up never redistributing or hosting
any modified lichess-org code as a network service (e.g., only calling the public
lichess API, or only using MIT-licensed pieces if any exist) — confirm per actual
dependency chosen, not assumed from this card alone.

---

### L1. Confirmed directly: chessground and python-chess are both GPL-3.0, not permissively licensed

**Practice:** Two of the most obvious "just a reusable library" candidates for this
project's stack are copyleft, confirmed by reading their license files directly (not
just secondary commentary): chessground's LICENSE file is the verbatim "GNU GENERAL
PUBLIC LICENSE / Version 3, 29 June 2007," and python-chess's LICENSE.txt is the same.
Lichess's own accompanying guidance for chessground is direct about the consequence:
"When you use Chessground for your website, your combined work may be distributed only
under the GPL, and you must release your source code to the users of your website."

**Reported by:** direct file reads, `lichess-org/chessground` LICENSE and
`niklasf/python-chess` LICENSE.txt, both read 2026-09-15; supplementary quote from
lichess-org repository description, read 2026-09-15.
URL: https://github.com/lichess-org/chessground/blob/master/LICENSE ,
https://github.com/niklasf/python-chess/blob/master/LICENSE.txt
Quote: "GNU GENERAL PUBLIC LICENSE / Version 3, 29 June 2007" (both files, verbatim
header).

**Harness surface:** licensing & code-reuse discipline.

**Tier:** PRACTICE-ASSERTED — this one is closer to fact-checked-ground-truth than
practitioner-reported, since it's a direct license-file read rather than a claim about
someone's experience; still filed at this tier per this document's uniform tier
convention.

**Evidence it would have helped on human-chess:** the falsifiable signal is the
project's own persisted "library of reusable code" being assembled under an assumed
permissive license (because "it's just a UI board widget" or "it's just move
validation, not the whole server") and only discovering the GPL obligation once the
combined app is ready to ship.

**Fit for THIS project:** HIGH for class 1 — this is precisely the survey the user
asked to start with, and the answer for two of the four named example projects
(lichess, and implicitly anything depending on python-chess-style libraries) is "not
permissive."

**Drop condition:** none — this is a durable fact about the current licenses of these
specific dependencies, re-check only if either project relicenses.

---

### L3. Stockfish's GPL linking boundary, and a live cautionary lawsuit over what counts as a compliant derivative [TOP-5]

**Practice:** Stockfish (GPLv3) draws a specific technical line documented by its
community: it "can be called as a program by other programs of any license, but
Stockfish can only be linked into programs of GPL licensed programs" — i.e., shelling
out to the Stockfish binary as a subprocess is fine from any license, but statically or
dynamically linking its code into a proprietary binary is not. There is a real,
concrete test of the boundary's edges: Stockfish's maintainers sued ChessBase over Fat
Fritz 2 and Houdini 6, alleging they were undisclosed derivative works; ChessBase
stopped selling one product and released partial source for the other, while whether
GPL requires disclosing *trained neural-network weights* alongside source code
remained legally unresolved as of the reporting.

**Reported by:** FOSSA Blog, "Stockfish vs. ChessBase and What it Means for GPL v3,"
read 2026-09-15; GPL-linking-boundary quote corroborated by search over
TalkChess/GameDev.net community discussion (not independently fetched — flagged at
lower citation grade below).
URL: https://fossa.com/blog/stockfish-vs-chessbase-gpl-v3/
Quote: "ChessBase did not comply with the requirements that apply to derivative
works."

**Caveat on citation grade:** the specific "can be called... but can only be linked
into GPL programs" phrasing came from a WebSearch synthesis of TalkChess/GameDev.net
forum discussion, not a page this agent fetched directly — flagged rather than
silently treated as read. The lawsuit facts themselves (FOSSA URL above) were read
directly.

**Harness surface:** licensing & code-reuse discipline.

**Tier:** PRACTICE-ASSERTED, mixed citation grade per the caveat.

**Evidence it would have helped on human-chess:** the falsifiable signal is human-chess
choosing to embed/link Stockfish or Leela source directly into a proprietary or
closed-license binary (e.g., a compiled desktop app or a mobile build using WASM/native
bindings) rather than shelling out to it as a subprocess or calling it over UCI —
without anyone having flagged that this specific technical choice (link vs. call) is
the actual legal line, not just "using an open-source engine."

**Fit for THIS project:** HIGH — the user explicitly named Stockfish and Leela as
survey targets for the reusable-code library, so this is squarely in scope for the
project's first planned step.

**Drop condition:** drop the "how you invoke it" nuance if human-chess only ever
subprocess-invokes prebuilt engine binaries over UCI (the low-risk path both engines'
communities describe) and never compiles engine source into its own binaries.

---

### L4. Even engine projects that accept AI-written contributions require explicit AI-usage disclosure and human review responsibility

**Practice:** Leela Chess Zero's contribution policy (see A4) pairs its scope
limitation with a disclosure norm: contributors must "clearly mention in your PR
description if you used AI tools, LLMs, or agentic coding approaches," and must
"thoroughly read, understand, and review all AI-generated code in detail before
submitting" — responsibility for correctness stays with the human contributor
regardless of how the code was produced.

**Reported by:** CONTRIBUTING.md, `LeelaChessZero/lc0`, read 2026-09-15 (same source as
A4).
URL: https://github.com/LeelaChessZero/lc0/blob/master/CONTRIBUTING.md
Quote: "thoroughly read, understand, and review all AI-generated code in detail before
submitting."

**Harness surface:** licensing & code-reuse discipline (filed here rather than under
agent roles because the operative concern is provenance/accountability of contributed
code, adjacent to the licensing-disclosure theme of this section).

**Tier:** PRACTICE-ASSERTED.

**Evidence it would have helped on human-chess:** less directly applicable since
human-chess isn't (yet) an open-source project accepting outside PRs, but the
underlying discipline — a human owns and reviews what an agent wrote before it's
treated as done, and that provenance is visible, not silent — is a reasonable norm to
self-apply even for a single maintainer's own agent-driven commits, especially given
the project's own stated intent to persist a reusable library others might later draw
on.

**Fit for THIS project:** MEDIUM — mainly relevant if/when human-chess opens to outside
contributors or itself becomes one of the "reusable library" projects others build on;
LOW urgency pre-launch.

**Drop condition:** drop until human-chess accepts external contributions or
publishes the reusable library it intends to persist.

---

## Stack OPTIONS (never a recommendation — what these projects actually use)

Presented as observed facts about the named example projects, for the user's own
survey step, not as a suggested stack for human-chess.

- **lichess (lila + satellite repos):** backend/frontend is Scala 3 on a customized
  Play Framework fork ("liplay"), async via Scala Futures and Pekko streams,
  WebSockets via a separate `lila-ws` server communicating over Redis, MongoDB for
  game storage (12B+ games), Elasticsearch for search, nginx in front. Chess rules
  logic is factored into a separate pure library, `scalachess` (Scala) with a
  TypeScript port, `chessops`. The board UI is a standalone library, `chessground`
  (TypeScript). Stockfish is compiled to WebAssembly as `stockfish-web` for
  in-browser analysis, and `fishnet` distributes server-side analysis using the real
  `official-stockfish/Stockfish` binary. Mobile is Flutter/Dart with
  `flutter-chessground` and `dartchess`. — Source: https://lichess.org/source (read
  2026-09-15).
- **chessground:** GPL-3.0-licensed standalone TypeScript board-rendering library,
  usable independent of lila. — Source:
  https://github.com/lichess-org/chessground/blob/master/LICENSE (read 2026-09-15).
- **python-chess:** GPL-3.0(+)-licensed pure-Python library for move
  generation/validation, PGN/FEN, Polyglot books, Syzygy/Gaviota tablebases, and
  UCI/XBoard engine communication — the most commonly cited rules/plumbing layer for
  Python-based chess tools. — Source:
  https://github.com/niklasf/python-chess/blob/master/LICENSE.txt (read 2026-09-15).
- **Stockfish:** GPLv3 UCI engine; strength changes are gated through Fishtest's
  distributed SPRT testing rather than unit tests alone (see V2). — Source:
  https://github.com/official-stockfish/fishtest/wiki/Creating-my-first-test (read
  2026-09-15).
- **Leela Chess Zero (lc0):** GPLv3 neural-network UCI engine; explicitly scopes
  agentic-coding contributions away from core engine internals (see A4/L4). —
  Source: https://github.com/LeelaChessZero/lc0/blob/master/CONTRIBUTING.md (read
  2026-09-15).
- **boardgame.io:** MIT-family turn-based game-state/networking framework (state
  reducer + server authority + bot framework split, see A2) — cited here as an
  example architecture for the "mini-game" side of this project's four classes, not a
  chess-specific tool. License not independently re-verified in this pass (not fetched
  directly; noted as unconfirmed rather than asserted).
- **chess-console (shaack):** ES6-module, no-build-step browser chess GUI framework
  (MessageBroker pub/sub + Promise-gated initialization, see A3) — smaller, more
  minimal alternative to chessground for a from-scratch board UI. License not
  independently re-verified in this pass.
- **chessdriller:** Svelte + Node.js + Prisma + Vite/Vitest open-source spaced-repetition
  opening trainer, positioned as "a free and libre alternative to... Chessable,
  ChessTempo, Chessmadra, ChessHQ, Chess Position Trainer, Bookup, Listudy" — cited
  here as a concrete example of the "openings builder and trainer" subproject's
  existing-tool landscape. — Source:
  https://github.com/gtim/chessdriller (read 2026-09-15).

---

## Searched but not read

Pages found via search but not fetched/read, or fetched and unreadable — never cited
as sources of any claim above:

- `chris-madsen/chess` raw `AGENTS.md` file directly (the file itself 404'd at the
  expected path; the repo root page was fetched instead and yielded quotes attributed
  to AGENTS.md — see caveats on A1/R4).
- Hacker News item 43496115 ("I used to hate analysing my chess games – now I use an
  AI agent") — WebFetch returned HTTP 429, never read.
- arXiv 2606.13763 ("Do programming languages still matter to your AI coding agent
  teammate? Evidence at scale from chess engines") — PDF fetched but returned only
  binary/structural metadata, not readable text; title and existence noted, no claims
  from its body are cited above.
- `chierhu.medium.com` "Claude Code for Game Development" survey — WebFetch returned
  HTTP 403, never read; only a search-snippet summary exists, and no claim from it is
  cited as read.
- `dev.to/jonesrussell` "Git hooks are your best defense against AI-generated mess" —
  surfaced by search with a relevant-looking claim about pre-commit hooks gating
  agent commits, but never fetched; not cited.
- Generic (non-chess-specific) AI-agent-memory blog posts surfaced under the memory
  conventions search (akitaonrails/ai-memory, felipefontoura.com, shawnos.ai,
  promptessor.com, amux.io, zylos.ai, jatinbansal.com, ai-tldr.dev) — none fetched;
  see the explicit gap noted under Memory Conventions above.
- `en-croissant` and `cutechess` contributing/testing docs — described only via search
  synthesis (pnpm test/lint/format commands for en-croissant), never fetched directly;
  not cited as read anywhere above.
- `openingtree/openingtree` README — described only via search synthesis; never
  fetched directly.
- `qam4/chess-coach` `docs/evaluation.md` and `docs/pedagogy.md` — referenced by the
  README that was fetched, but not themselves fetched or read.

---

## Search log

| # | Query | Useful hits | Notes |
|---|-------|-------------|-------|
| 1 | chess github repo "CLAUDE.md" AI agent | 3 | Productive — "CLAUDE.md" artifact-type term surfaced shaack/chess-console directly |
| 2 | chess engine "AGENTS.md" github repository | 2 | Productive — "AGENTS.md" term surfaced chris-madsen/chess and seajay-chess |
| 3 | building a chess trainer with Claude Code devlog | 4 | Productive — surfaced ChessNotate, claude-chess, blunder-trainer devlogs |
| 4 | "perft" test AI coding agent chess engine verification | 3 | Productive — "perft" artifact-type term is the single best-performing seed in this pass |
| 5 | lichess AGPL license reuse code fork rules | 4 | Productive — established the AGPL network-copyleft mechanism |
| 6 | "python-chess" AI agent contributing guidelines test | 0 | Dead end — only toy AI-vs-chess projects, no harness content |
| 7 | Stockfish contributing fishtest SPRT verification patch | 4 | Productive — SPRT/Fishtest verification model |
| 8 | "golden test" OR "regression test" chess puzzle database AI agent | 0 | Dead end — genre terms too broad, returned ML papers instead of harness practice |
| 9 | Hacker News chess engine AI coding agent perft | 2 | Productive — surfaced the 5-agent dev.to piece and confirmed perft-as-oracle pattern |
| 10 | "en-croissant" OR "cutechess" github contributing testing engine | 1 | Weak — found the repos, contributing content only via search synthesis, not fetched |
| 11 | Leela Chess Zero lc0 contributing license reuse GPL | 3 | Productive — AI-disclosure PR norm + GPL scope limitation |
| 12 | "opening tree" OR "repertoire trainer" github AI agent build spaced repetition | 2 | Partial — good subproject landscape, no AI-harness content |
| 13 | "explain this chess move" LLM beginner plain language engine evaluation | 3 | Productive — surfaced chess-coach and the hallucination-commentary paper |
| 14 | chess.com game review AI "how it works" natural language explanation | 1 | Productive — led to the direct Chess.com support-article fetch |
| 15 | LLM chess tutoring beginners practice paper plain language explanation evaluation | 2 | Partial — mostly academic benchmarks, one useful lead (chess-tutor repo, not fetched) |
| 16 | "cursorrules" chess repo github | 1 | Productive — found Yarin78/morphy, the only chess `.cursorrules` located |
| 17 | chess.js github contributing PGN FEN round trip test | 0 | Dead end — no contributing/testing detail surfaced beyond repo existence |
| 18 | "headless" game logic AI agent test deterministic devlog | 1 | Weak — mostly generic game-QA content, one relevant deterministic-hashing issue thread (not fetched) |
| 19 | "game state" validation AI coding agent multiplayer board game devlog | 1 | Productive — surfaced boardgame.io's AGENTS.md, the best game-dev-class hit of the whole pass |
| 20 | chessbook repertoire trainer github open source | 1 | Partial — landscape only, chessdriller most useful (later fetched) |
| 21 | visualization trainer chess blindfold app build AI agent devlog | 0 | Dead end — pure app-store/product listings, no devlog/harness content |
| 22 | "Show HN" chess trainer OR chess tool built with AI | 2 | Partial — product landscape, learnchess.ai lead not independently fetched |
| 23 | lobste.rs chess engine AI agent | 1 | Weak — lobste.rs itself returned nothing; incidentally surfaced Chessmata |
| 24 | "what rating can you beat" chess opening trainer bot build | 0 | Dead end — pure product content (Chessiverse, lichess bots), no harness angle |
| 25 | lila lichess tech stack scala chessground architecture | 4 | Productive — confirmed the full lichess stack, later fetched directly at lichess.org/source |
| 26 | Stockfish GPL derivative work reuse commercial app rules | 3 | Productive — surfaced the ChessBase lawsuit, later fetched directly via FOSSA |
| 27 | "session handoff" OR "progress.md" OR "scratchpad" AI agent game development memory convention | 0 | Dead end for this class — only generic, non-chess AI-memory blogs; none fetched (see Memory Conventions gap) |
| 28 | pre-commit hook chess engine repo AI agent enforce test perft | 2 | Partial — confirmed perft-as-pre-commit-gate pattern conceptually, jonesrussell piece not fetched |
| 29 | "vendor" OR "vendored" open source chess engine code reuse library discipline project structure | 0 | Dead end — no project actually documents a vendoring discipline; genre term too broad |
| 30 | collaborative multiplayer "group plays chess" open source project | 1 | Weak for harness content, but surfaced Chessmata (later fetched) |
| 31 | "openingtree" github project analysis architecture | 1 | Partial — confirmed openingtree's function, no harness content, README not fetched |
| 32 | Anthropic Claude Code building a game engine blog verification testing agent | 3 | Productive — surfaced the self-evaluation dev.to piece, the best cross-cutting harness hit of the whole pass |
| 33 | python-chess license GPL niklasf github license file | 1 | Productive — confirmed GPL-3.0(+) for python-chess directly |
| 34 | chessground license lichess-org github LICENSE | 1 | Productive — confirmed GPL-3.0 for chessground directly |

**Summary:** 34 WebSearch queries run, plus ~22 WebFetch reads (4 failed: one 404, one
429, one unreadable binary PDF, one 403 — all listed under "searched but not read").
Roughly 20 of 34 queries (~59%) were productive (returned at least one source worth
fetching or a fact worth citing); the rest were dead ends, concentrated in
genre-labeled searches ("golden test," "vendored," "what rating can you beat,"
"headless... devlog") rather than artifact-typed ones. The seed terms that
consistently paid off were exact artifact-type nouns — "CLAUDE.md", "AGENTS.md",
"perft", ".cursorrules", "AGPL", "GPL", "LICENSE" — while genre/community labels
("golden test," "devlog," "vendored," community-name searches like "lobste.rs X") were
reliably weak, confirming the lesson this pass was seeded from. On the "one search step
or separate seeds per class" question: no, one generic seed set did not cover all four
classes evenly — class 1 (chess tooling) and the licensing angle were rich and
fast to saturate on artifact-type + license-name terms; class 4 (analysis-for-
beginners) needed its own distinct seed vocabulary ("explain," "plain language,"
"hallucination," "commentary") that has nothing to do with chess-specific artifact
terms; class 2 (mini-game/agent dev) needed generic game-dev harness terms
("headless," "game state," "AGENTS.md" + "multiplayer") that returned mostly noise
until paired with "board game" specifically; and class 3 (trainer-building) barely
returned any harness-relevant material at all under any phrasing tried, only
product-landscape hits — suggesting a from-scratch init interview for a project like
this should run at least two to three distinctly-seeded search passes (chess-tooling
artifact terms; agent-self-evaluation/verification terms; licensing terms), not one
shared query set, and should expect the trainer-building class specifically to come up
mostly empty on harness practice regardless of phrasing.
