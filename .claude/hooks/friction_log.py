#!/usr/bin/env python3
"""
Friction logger — portable observe-loop component.

Called by the /friction slash command:
    python3 .claude/hooks/friction_log.py "<note>" [dimension]

Appends one decision-grade entry to observe/observe-log.jsonl.

Verification modes (so self-tests don't pollute the decision-grade corpus):
    --dry-run   build and print the entry but write NOTHING
    --test      append the entry but as decision_grade: false
"""
import argparse
import fcntl
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

VALID_DIMENSIONS = {
    "persistence_memory",
    "agent_roles_skills",
    "guardrails",
}

MAX_NOTE_LEN = 2000


def build_entry(note: str, dimension, decision_grade: bool, is_test: bool) -> dict:
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "type": "friction",
        "signal": "manual_friction",
        "decision_grade": decision_grade,
        "dimension": dimension,
        "step": None,
        "note": note,
        "source": "command:/friction",
    }
    if is_test:
        entry["test"] = True
    return entry


def parse_args(argv=None):
    parser = argparse.ArgumentParser(prog="friction_log.py")
    parser.add_argument("note", help="the friction note")
    parser.add_argument("dimension", nargs="?", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--test", action="store_true")
    return parser.parse_args(argv)


def run(args, log_path: Path) -> dict:
    note = args.note.strip()
    if not note:
        print("Usage: friction_log.py '<note>' [dimension]", file=sys.stderr)
        sys.exit(1)
    if len(note) > MAX_NOTE_LEN:
        note = note[:MAX_NOTE_LEN] + "...[truncated]"

    raw_dim = args.dimension.strip() if args.dimension else None
    dimension = raw_dim if raw_dim in VALID_DIMENSIONS else None

    decision_grade = not args.test
    entry = build_entry(note, dimension, decision_grade=decision_grade, is_test=args.test)

    preview = note[:72] + ("..." if len(note) > 72 else "")
    if args.dry_run:
        print(f"[dry-run — not logged] {preview}")
        print(json.dumps(entry))
    else:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(entry) + "\n"
        with open(log_path, "a", encoding="utf-8") as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(line)
                f.flush()
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        tag = "test, decision_grade=false" if args.test else "decision_grade"
        print(f"[friction logged — {tag}] {preview}")

    if raw_dim and dimension is None:
        print(f"  (unknown dimension '{raw_dim}' ignored; valid: {sorted(VALID_DIMENSIONS)})")
    return entry


def main(argv=None) -> None:
    args = parse_args(argv)
    # Derive project root from this script's location (.claude/hooks/ -> project root)
    project_root = Path(__file__).resolve().parent.parent.parent
    log_path = project_root / "observe" / "observe-log.jsonl"
    run(args, log_path)


if __name__ == "__main__":
    main()
