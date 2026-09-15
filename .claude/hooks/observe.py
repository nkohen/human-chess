#!/usr/bin/env python3
"""
Passive observe hook — portable observe-loop component.

Fires on: Stop, PostToolUse (Edit|Write).
Appends structured JSONL entries to observe/observe-log.jsonl.

Passive entries are marked decision_grade: false.
Decision-grade signal comes from explicit /friction invocations only.

The log path is anchored to the PROJECT ROOT (CLAUDE_PROJECT_DIR, else this
script's location), NEVER to the process cwd: resolving the log relative to cwd
fragments the append-only audit trail whenever a tool runs from a subdirectory
(matching friction_log.py). This is the H1 harvest-back fix — the same defect
was reproduced and fixed in two deployed targets before it reached the template.

This hook does NOT depend on almanac being installed — it is a standalone
passive logger for the observe loop.
"""
import fcntl
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def project_root() -> Path:
    """The project root: CLAUDE_PROJECT_DIR when the platform sets it, else this
    script's own location (.claude/hooks/observe.py -> project root). Never the
    process cwd, which drifts into subdirectories and would fragment the
    append-only log into stray observe/ trees."""
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parent.parent.parent


def get_log_path() -> Path:
    return project_root() / "observe" / "observe-log.jsonl"


def append_entry(entry: dict) -> None:
    log_path = get_log_path()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry) + "\n"
    with open(log_path, "a", encoding="utf-8") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            f.write(line)
            f.flush()
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def handle_stop(session_id: str, ts: str) -> None:
    append_entry({
        "ts": ts,
        "type": "observe",
        "signal": "session_end",
        "decision_grade": False,
        "dimension": None,
        "step": None,
        "note": None,
        "source": "hook:Stop",
        "session_id": session_id,
    })


def handle_post_tool_use(payload: dict, session_id: str, ts: str) -> None:
    tool_name = payload.get("tool_name", "")
    if tool_name not in ("Edit", "Write"):
        return
    tool_input = payload.get("tool_input", {})
    file_path = tool_input.get("file_path", tool_input.get("path", ""))
    # The note is repo-relative to the project root (a stable descriptor),
    # not to the drifting cwd.
    try:
        rel_path = os.path.relpath(file_path, project_root()) if file_path else ""
    except ValueError:
        rel_path = file_path or ""
    append_entry({
        "ts": ts,
        "type": "observe",
        "signal": "file_write",
        "decision_grade": False,
        "dimension": None,
        "step": f"tool:{tool_name}",
        "note": f"wrote {rel_path}",
        "source": "hook:PostToolUse",
        "session_id": session_id,
    })


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    event = payload.get("hook_event_name", "")
    session_id = payload.get("session_id", "")
    ts = datetime.now(timezone.utc).isoformat()

    if event == "Stop":
        handle_stop(session_id, ts)
    elif event == "PostToolUse":
        handle_post_tool_use(payload, session_id, ts)


if __name__ == "__main__":
    main()
