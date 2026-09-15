# Observe & Friction Rules

## When to log friction

Log a friction entry with `/friction "<note>"` whenever:
- A guardrail blocked something it shouldn't have
- A memory file was stale, missing, or didn't help
- A sub-agent required correction or re-prompting
- Any moment requiring unexpected rework

The friction log is the primary decision-grade signal. If you won't do it here, no one will.

## What makes a good friction note

Good: "sub-agent researcher hallucinated a URL when no web access was available"
Bad: "something went wrong"

Include: what dimension, what step, what the unexpected behavior was.

## Passive entries

Passive entries (session_end, file_write) are logged automatically by hooks.
These are marked `decision_grade: false`. Do not mistake passive metrics for evidence.

## Verifying the friction tooling (don't pollute decision-grade signal)

When you only want to check that friction logging *works* — not record real friction —
never let the self-test become a decision-grade entry. Use:
- `python .claude/hooks/friction_log.py --dry-run "<note>"` — builds and prints the entry, writes nothing.
- `python .claude/hooks/friction_log.py --test "<note>"` — appends as `decision_grade: false` (a baseline, not evidence).

Real friction always goes through `/friction` and is decision-grade. (Self-tests recorded as
decision-grade quietly inflate a noise floor — keep them out of the signal.)

## Observe log hygiene

`observe/observe-log.jsonl` is append-only. Do not modify or delete entries.
Mechanically enforced: the guard hook denies Write/Edit on observe-log.jsonl.
