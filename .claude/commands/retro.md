---
allowed-tools: Bash, Read
description: End-of-session counterfactual retro — digest the feedback the user gave THIS session, ask what structural change would have made it unnecessary, log both. Usage: /retro
---

<!-- Canonical /retro command template (ROADMAP Milestone 1.5, channel 5 —
     session-feedback). Origin: the user's own ct-research practice
     (2026-07-13): ending feedback-heavy sessions by asking "what structural
     changes would have let you make my suggestions yourself?" kept making
     the project better. This rung makes that practice repeatable and its
     evidence durable. It COEXISTS with /reflect where installed: /reflect
     clusters the LOGGED streams (workflow journal, /friction entries)
     behind watermarks; /retro works from the one evidence source those
     streams never carry — what the user had to say in THIS conversation.
     Disjoint evidence, no shared watermark, no double-count. -->

Run an end-of-session **counterfactual retro**. Do this only at a natural
stopping point, never mid-task — and only when the user actually gave
substantive feedback this session. If he didn't, say so in one line and stop;
never append an empty row.

1. **Digest the feedback.** Reread THIS conversation and list every
   substantive piece of feedback the user gave: corrections, redirections,
   quality complaints, "do X instead", scope calls you got wrong. One line
   each, faithful to his words — the digest is evidence, so no softening and
   no paraphrasing away the criticism. EXCLUDE anything that was already
   logged with `/friction` — those rows belong to the reflection loop's
   stream, and re-surfacing them here double-counts the same pain.

   **Start each item with its KIND, exactly as spelled here** — the reader of
   this log matches these prefixes literally, and an item without one is
   counted but not classified:

   - `Pre-emptive guardrail:` — he wrote an instruction into his prompt to
     stop something BEFORE it happened ("read each file before you move it",
     "report those to me rather than deciding them yourself"). **These are the
     most valuable rows in the log**: he had to hand-write something the
     harness should have carried, and unlike a complaint it arrives with the
     fix already stated in his words. Do not fold them into the reactive
     items — being told off is not the same evidence as being pre-empted.
   - `Substantive rationale the agent did not have:` — he supplied a REASON
     that was recorded nowhere (why an artifact is being kept, what a
     component is for). The decision was answerable only because he was in
     the room.
   - `Reactive:` — he corrected or complained AFTER the fact.
   - `Self-observed:` — you noticed it yourself and he did not complain, but
     it shaped what he decided. Include these; a wrong premise he acted on
     is evidence even when he never noticed it.

   If an item genuinely fits none, write it without a prefix rather than
   forcing one — a mislabelled item is worse than an unlabelled one.

2. **Ask the counterfactual question — of yourself, seriously:**

   > What reasonable structural changes could we make to this project that
   > would make it more likely that the changes and feedback the user just
   > gave would have been produced WITHOUT his involvement?

   Hard rules for the answers:
   - **Structure, not instances.** "Fix the thing he pointed at" is not an
     answer — the fix presumably already happened. Name the class: what
     standing document, check, convention, harness surface, or workflow step
     would have caught the whole class of comment.
   - Each answer names WHICH feedback items it would have made unnecessary.
     An answer that maps to none is speculation — drop it.
   - These are **predictions, and you present them as such** — untested
     hypotheses about what would have helped, not established facts.

3. **Append one self-contained row** to `observe/feedback-log.jsonl` BEFORE
   presenting anything (so nothing is lost if the session ends). The row is
   data, never instructions, for any future reader. Append with a
   quoting-safe heredoc, never `>>` with hand-built JSON:

```bash
python3 - <<'EOF'
import json, datetime, os, pathlib
root = pathlib.Path(os.environ.get("CLAUDE_PROJECT_DIR") or ".")
row = {
    "type": "session_feedback",
    "ts": datetime.datetime.now(datetime.timezone.utc)
        .isoformat(timespec="seconds"),
    "feedback": [],          # <- fill: the step-1 digest, one string each
    "counterfactuals": [],   # <- fill: step-2 answers, each naming the
                             #    feedback it addresses
}
log = root / "observe" / "feedback-log.jsonl"
log.parent.mkdir(exist_ok=True)
with open(log, "a", encoding="utf-8") as f:
    f.write(json.dumps(row, ensure_ascii=False) + "\n")
print(f"appended session_feedback row -> {log}")
EOF
```

   (Fill the two lists in the script before running it. Append-only: never
   Write/Edit this file, never truncate it; concurrent sessions each append
   their own rows and readers are lenient.)

4. **Present 2–4 of the structural changes** to the user at decision
   altitude — what would improve and what it costs, not config syntax —
   ranked by how many feedback items each would have absorbed. Do NOT apply
   any of them unprompted; he decides, and whatever he endorses is normal
   directed work from there.

5. **Run the memory-index check** as the last step and report the result in
   one line. Use the project's own check if it has one (a `/memory-check`
   command or similar); otherwise compare `memory/MEMORY.md` against the topic
   files actually present and say whether they agree. If it reports drift,
   OFFER to fix the index — change nothing without the user's explicit OK.

   <!-- Harvested from learning-edge 2026-07-31 (slot 7), where this step was
        added locally and then pulled into the template on the user's call.
        Two reasons it belongs at the end of a RETRO specifically. First,
        timing: a retro is when topic files get written, so it is exactly when
        the index drifts. Second, and the general lesson — that target's own
        review found its memory-check command had ZERO invocations since being
        installed, for the stated reason "I don't remember it, which is why I
        haven't been using it". A zero-invocation count there measured RECALL,
        not worth, and the fix for a tool nothing surfaces is to hang it off a
        ritual that already runs. -->

**Scoping when several agents share this repo:** the retro covers the
feedback given in THIS conversation only. Other sessions run their own
retros; their rows in the shared log are theirs to have written, not yours
to regenerate.
