---
allowed-tools: Bash, Read, AskUserQuestion
description: Run almanac's harness-evolution loop — generate evidence-cited harness improvements and review them with the user. Usage: /almanac-evolve
---

<!-- Canonical /almanac-evolve command template (evolve-v2 design §6, build-plan
     step 6). Installed per-target with the ALMANAC_* defaults filled in for
     that machine; not part of the minimal/guarded archetype trees yet. -->

Run the almanac evolve loop over THIS project's harness. The engine generates
and gates the proposals; your job is presentation and collecting the user's
decisions. Follow these steps exactly.

0. **Bring the engine current, and STOP if you cannot.** The proposals are
   only as good as the code that generates them, and which code runs is
   invisible here — a checkout on a stale branch silently generates from
   superseded logic. This fetches and fast-forwards the engine when safe, then
   gates, before you spend a model call:

```bash
"${ALMANAC_BIN:-/Users/nkohen/dev/almanac-v2/.venv/bin/almanac}" self-check --fetch --update
```

   Exit 0 → current (already, or safely fast-forwarded just now); proceed, and
   the `almanac` calls below run the updated code. Non-zero → it could not be
   made current automatically (off the default branch, dirty tree, local
   commits, or a non-editable install); it prints the fix. Do that, re-run
   this line, and only then continue.

1. **Refresh the analysis, then generate.** Each is one cached model call —
   re-runs on unchanged evidence are free, so never loop them. Analyzing
   first keeps the H-IR (and its weakness reads) current with the harness as
   it actually is today:

```bash
"${ALMANAC_BIN:-/Users/nkohen/dev/almanac-v2/.venv/bin/almanac}" analyze "$CLAUDE_PROJECT_DIR" --cache-dir "$CLAUDE_PROJECT_DIR/.almanac/cache"
"${ALMANAC_BIN:-/Users/nkohen/dev/almanac-v2/.venv/bin/almanac}" propose "$CLAUDE_PROJECT_DIR" ${ALMANAC_PROPOSE_ARGS} --cache-dir "$CLAUDE_PROJECT_DIR/.almanac/cache"
```

   **`propose` is a long-running model call (often many minutes).** If your
   session supports background tasks, launch it in the background from the
   FIRST attempt and let the completion notification wake you — do NOT run
   it foreground into a command timeout, and do NOT sleep-poll in a shell
   loop: cumulative sleeps can overrun the shell timeout and spuriously
   fail the wait. (`analyze` is quick and can stay foreground.)
   <!-- Harvested from ct-research 2026-07-08: its evolved command shipped
        this guidance as proposal evolve-command-no-sleep-poll, applied
        2026-07-04, prediction HELD at review #4 (no recurrence of the
        sleep-poll timeout friction). First slot-7 harvest with an outcome
        record attached. -->

2. **List what's pending:**

```bash
"${ALMANAC_BIN:-/Users/nkohen/dev/almanac-v2/.venv/bin/almanac}" review --list "$CLAUDE_PROJECT_DIR"
```

3. **Present each pending proposal to the user EXACTLY at the listed
   altitude** — title, "You'll notice", "Trade-off", "Why now" — and collect
   one decision per proposal (approve / deny / skip). Hard presentation
   rules:
   - Do NOT show diffs, file paths, permission strings, or any config syntax
     in the default view, and do not paraphrase the change in mechanism terms.
   - If the user asks for details, show the output of
     `"${ALMANAC_BIN:-/Users/nkohen/dev/almanac-v2/.venv/bin/almanac}" review --explain <id> "$CLAUDE_PROJECT_DIR"`,
     then re-ask for their decision.
   - Give your recommendation only if asked; the point is their review, not
     your confidence.

4. **Execute each decision**, always passing the `fingerprint:` value the
   listing printed for that proposal — if another session regenerated the
   slate meanwhile, the command fails closed instead of applying a change
   the user never saw:
   - approve → `"${ALMANAC_BIN:-/Users/nkohen/dev/almanac-v2/.venv/bin/almanac}" apply "$CLAUDE_PROJECT_DIR" --id <id> --fingerprint <fp>`
   - deny → `"${ALMANAC_BIN:-/Users/nkohen/dev/almanac-v2/.venv/bin/almanac}" deny "$CLAUDE_PROJECT_DIR" --id <id> --fingerprint <fp> --reason "<their words, if given>"`
   - skip → do nothing; it stays pending.

   NEVER run apply without that proposal's explicit approval in this
   conversation. There is no batch approve.

5. **Report plainly:** one line per proposal — applied, denied, or blocked
   (if the verification gate blocked an approved proposal, say so in one
   sentence and move on; the block is recorded).
