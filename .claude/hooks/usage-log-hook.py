#!/usr/bin/env python3
"""Stop + SessionEnd hook: persist a usage summary line for the session.

Canonical almanac template (ROADMAP Milestone 1.5, channel 1 — cost &
model-usage telemetry, the PERSISTENT half; the live half is
usage-statusline.py).

WIRING (2026-07-16, the A3 liveness fix): wired on BOTH Stop (primary — fires
every turn, so capture works where SessionEnd is unreliable: the VS Code
extension, unclean exits, container teardown) and SessionEnd (finalizer — a
complete row on a clean exit). Every row is a CUMULATIVE whole-transcript
summary keyed by session_id, so the reader (usage.py) keeps the MOST-COMPLETE
row per session — the many Stop rows collapse to one correct session row, never
summed. The Stop transcript can lag the current turn (written async by the
platform), so an intermediate Stop row may trail by a turn; the next Stop (or
SessionEnd) catches up. Event-agnostic: the same summarize-and-append logic runs
for either event.

Appends one JSON line to observe/usage-log.jsonl:

    {ts, type:"usage", session_id, models, turns, tokens_in, tokens_out,
     cache_read_tokens, duration_s, by_model, decision_grade: false, source}

by_model splits the same totals per model id (turns/tokens_in/tokens_out/
cache_read_tokens), so the consumer can attribute cost exactly instead of
bucketing multi-model sessions as "mixed".

This is passive telemetry WITH A NAMED CONSUMER (the roadmap rule): almanac's
usage reader (`almanac usage-report`, engine module usage.py) aggregates this
stream into a token-usage report — right-sizing, context-bloat, and
cache-reuse readings — that `almanac propose` feeds to the evolve generator
as citable evidence. decision_grade is false: usage rows are instrument
readings, never friction evidence.

Never crashes the session: any internal error exits 0 silently. Stdlib-only.
"""
import json
import os
import sys
from datetime import datetime, timezone

MAX_TRANSCRIPT_BYTES = 200_000_000


def summarize_transcript(path):
    """Totals over one session transcript, or None if unreadable/empty."""
    if not path or not os.path.isfile(path) \
            or os.path.getsize(path) > MAX_TRANSCRIPT_BYTES:
        return None
    tin = tout = cache_read = turns = 0
    models = set()
    by_model = {}
    first_ts = last_ts = None
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if not isinstance(entry, dict):
                continue
            ts = entry.get("timestamp")
            if isinstance(ts, str):
                first_ts = first_ts or ts
                last_ts = ts
            msg = entry.get("message")
            if not isinstance(msg, dict):
                continue
            usage = msg.get("usage")
            if not isinstance(usage, dict):
                continue
            turns += 1
            entry_in = (usage.get("input_tokens") or 0) \
                + (usage.get("cache_read_input_tokens") or 0) \
                + (usage.get("cache_creation_input_tokens") or 0)
            entry_cache = usage.get("cache_read_input_tokens") or 0
            entry_out = usage.get("output_tokens") or 0
            tin += entry_in
            cache_read += entry_cache
            tout += entry_out
            if isinstance(msg.get("model"), str):
                models.add(msg["model"])
                m = by_model.setdefault(msg["model"], {
                    "turns": 0, "tokens_in": 0, "tokens_out": 0,
                    "cache_read_tokens": 0,
                })
                m["turns"] += 1
                m["tokens_in"] += entry_in
                m["tokens_out"] += entry_out
                m["cache_read_tokens"] += entry_cache
    if not turns:
        return None
    duration_s = None
    try:
        if first_ts and last_ts:
            f_dt = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
            l_dt = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
            duration_s = int((l_dt - f_dt).total_seconds())
    except ValueError:
        pass
    return {
        "models": sorted(models),
        "turns": turns,
        "tokens_in": tin,
        "tokens_out": tout,
        "cache_read_tokens": cache_read,
        "duration_s": duration_s,
        "by_model": {m: by_model[m] for m in sorted(by_model)},
    }


def main():
    raw = sys.stdin.read()
    data = json.loads(raw, strict=False) if raw.strip() else {}
    summary = summarize_transcript(data.get("transcript_path"))
    if summary is None:
        return
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "type": "usage",
        "signal": "session_usage",
        "decision_grade": False,
        "session_id": data.get("session_id"),
        **summary,
        "source": "hook:usage_log",
    }
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))))
    log_path = os.path.join(project_root, "observe", "usage-log.jsonl")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
