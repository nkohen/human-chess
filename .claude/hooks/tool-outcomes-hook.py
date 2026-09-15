#!/usr/bin/env python3
"""Stop + SessionEnd hook: persist a tool-outcome summary line for the session.

Canonical almanac template (ROADMAP Milestone 1.5, channel 4 —
session-transcript / tool-outcome mining, ratified 2026-07-04).

WIRING (2026-07-16, the A3 liveness fix): wired on BOTH Stop (primary — fires
every turn, so capture works where SessionEnd is unreliable, e.g. the VS Code
extension) and SessionEnd (finalizer). Each row is a CUMULATIVE whole-transcript
summary keyed by session_id, and the reader (tool_outcomes.py) keeps the
MOST-COMPLETE row per session, so the many Stop rows collapse to one — never
multiply-counted. Event-agnostic logic.

Appends one JSON line to observe/tool-outcomes.jsonl:

    {ts, type:"tool_outcomes", signal:"session_tool_outcomes",
     decision_grade: false, session_id,
     tools: {ToolName: {calls, errors, rejections, error_examples[<=3]}},
     interruptions, source}

rejections counts results the USER declined (permission/plan rejections) —
friction with the human, not tool breakage — kept out of ``errors`` so error
rates measure what actually failed (first real report inflated ExitPlanMode
to an 85% "error" rate out of plan rejections, 2026-07-08).

This is passive capture WITH A NAMED CONSUMER (the standing rule): almanac's
tool-outcome reader (`almanac tool-outcomes-report`, engine module
tool_outcomes.py) aggregates the stream into recurring-failure /
error-rate / interruption readings that `almanac propose` feeds to the
evolve generator as citable evidence. decision_grade is false: outcome rows
are instrument readings, never friction evidence.

Capture is transcript-derived at session end (one row per session, low
volume) and platform-portable by construction — the ratified channel-1
strategy: hooks over provider telemetry, because targets may not always be
Claude Code. Error text is truncated to first lines; the CONSUMER treats it
as data, never instructions.

Never crashes the session: any internal error exits 0 silently. Stdlib-only.
"""
import json
import os
import sys
from datetime import datetime, timezone

MAX_TRANSCRIPT_BYTES = 200_000_000
MAX_ERROR_EXAMPLES = 3      # per tool, deduplicated first-lines
MAX_EXAMPLE_CHARS = 200
INTERRUPT_MARKER = "[Request interrupted by user"
REJECT_MARKER = "doesn't want to proceed"


def _first_line(text):
    line = text.strip().splitlines()[0] if text.strip() else ""
    return " ".join(line.split())[:MAX_EXAMPLE_CHARS]


def _result_text(block):
    """The text content of a tool_result block (string or content-block list)."""
    content = block.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict) and isinstance(c.get("text"), str):
                parts.append(c["text"])
        return "\n".join(parts)
    return ""


def summarize_transcript(path):
    """Tool-outcome totals over one session transcript, or None if
    unreadable / no tool activity."""
    if not path or not os.path.isfile(path) \
            or os.path.getsize(path) > MAX_TRANSCRIPT_BYTES:
        return None
    tool_by_use_id = {}
    tools = {}
    interruptions = 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if not isinstance(entry, dict):
                continue
            msg = entry.get("message")
            if not isinstance(msg, dict):
                continue
            content = msg.get("content")
            if isinstance(content, str):
                if INTERRUPT_MARKER in content:
                    interruptions += 1
                continue
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "tool_use":
                    name = block.get("name")
                    use_id = block.get("id")
                    if isinstance(name, str):
                        if isinstance(use_id, str):
                            tool_by_use_id[use_id] = name
                        t = tools.setdefault(
                            name, {"calls": 0, "errors": 0, "rejections": 0,
                                   "error_examples": []})
                        t["calls"] += 1
                elif btype == "tool_result":
                    name = tool_by_use_id.get(block.get("tool_use_id"))
                    if name is None:
                        continue
                    t = tools.setdefault(
                        name, {"calls": 0, "errors": 0, "rejections": 0,
                               "error_examples": []})
                    if block.get("is_error") is True:
                        text = _result_text(block)
                        if REJECT_MARKER in text:
                            t["rejections"] += 1
                            continue
                        t["errors"] += 1
                        example = _first_line(text)
                        if example and example not in t["error_examples"] \
                                and len(t["error_examples"]) \
                                < MAX_ERROR_EXAMPLES:
                            t["error_examples"].append(example)
                elif btype == "text":
                    text = block.get("text")
                    if isinstance(text, str) and INTERRUPT_MARKER in text:
                        interruptions += 1
    if not tools and interruptions == 0:
        return None
    return {
        "tools": {n: tools[n] for n in sorted(tools)},
        "interruptions": interruptions,
    }


def main():
    raw = sys.stdin.read()
    data = json.loads(raw, strict=False) if raw.strip() else {}
    summary = summarize_transcript(data.get("transcript_path"))
    if summary is None:
        return
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "type": "tool_outcomes",
        "signal": "session_tool_outcomes",
        "decision_grade": False,
        "session_id": data.get("session_id"),
        **summary,
        "source": "hook:tool_outcomes",
    }
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))))
    log_path = os.path.join(project_root, "observe", "tool-outcomes.jsonl")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
