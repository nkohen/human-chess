#!/usr/bin/env python3
"""
Memory-index hook — makes "always loaded" true instead of asserted.

Fires on: SessionStart. Prints memory/MEMORY.md to stdout, which the platform
folds into the session's context.

WHY THIS EXISTS: CLAUDE.md tells you the memory index is always loaded. Without
this hook that is a prose promise with nothing behind it — the index sits on
disk and enters context only if someone happens to read it. Found on a real
project (2026-07-31) where the in-repo memory/ stayed empty for a whole session
while the model wrote to the platform's own auto-memory store instead, because
nothing surfaced the in-repo one. A harness that claims a mechanism must ship
it; see docs/pattern-catalog.md on gating theater.

Standalone: does NOT depend on almanac being installed. Stdlib only.
Fail-open by construction — a context nicety must never wedge a session, so
every failure path exits 0 silently.
"""
import json
import os
import sys
from pathlib import Path

# Behavior token. Instantiation probes find an installed rung by what it DOES,
# never by filename — targets rename freely, and a name-based probe has
# false-matched twice (over-broad-marker class, instantiate.py).
MEMORY_INDEX_MARKER = "almanac:memory-index"

# A runaway index would crowd out the session it is meant to help. Truncate
# rather than skip: a partial index still beats none, and the notice tells the
# reader to open the file directly.
MAX_CHARS = 16000


def project_root(payload: dict) -> Path:
    """Resolve the project root, most explicit signal first.

    CLAUDE_PROJECT_DIR is what the platform sets and what the settings.json
    wiring uses; the payload's cwd is the runtime fallback; __file__ works even
    when the hook is invoked by hand (this file lives at
    <root>/.claude/hooks/), which is how it gets tested.
    """
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env)
    cwd = payload.get("cwd")
    if cwd:
        return Path(cwd)
    return Path(__file__).resolve().parent.parent.parent


def render(index_path: Path) -> str:
    """The text to inject, or '' when there is nothing worth injecting."""
    try:
        text = index_path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeDecodeError):
        return ""
    if not text:
        return ""
    truncated = False
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS]
        truncated = True
    out = [
        "# Memory index (memory/MEMORY.md)",
        "",
        "Loaded at session start. Each line points at a topic file under "
        "memory/ — read the file before relying on it, and update this index "
        "whenever you add or remove one.",
        "",
        text,
    ]
    if truncated:
        out += [
            "",
            f"[index truncated at {MAX_CHARS} characters — read "
            "memory/MEMORY.md directly for the rest]",
        ]
    return "\n".join(out)


def main() -> None:
    try:
        raw = sys.stdin.read()
    except Exception:
        raw = ""
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    body = render(project_root(payload) / "memory" / "MEMORY.md")
    if body:
        print(body)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
