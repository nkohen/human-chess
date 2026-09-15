#!/usr/bin/env python3
"""Stop hook: proactive-friction nudge.

<!-- [Card 3.2, n=1 KEPT — proactive-friction nudge]
     Mechanical backing for the Q5 "log unprompted" default. The historical cost
     (spine Q5): agent discipline demonstrably fails exactly on SELF-caused
     friction — the one friction the agent itself caused went unlogged until the
     user prompted it. Card 3.1 measured the general lesson: prose the agent must
     remember loses to a hook. This nudge is the mechanism-before-promise backing
     for Q5's prose. HONEST TIER: it RELOCATES the gap rather than closing it — it
     reminds; the human must still run /friction. Efficacy is UNMEASURED (kept and
     unreverted on ct-research, no outcome number yet). -->

Fires when the agent finishes responding. Every Nth stop (recurrence-gated,
default every 5th) it prints ONE short reminder to log any self-caught mistake
from this turn. It never blocks stopping and never re-engages the agent — a
non-blocking reminder only, so it cannot wedge or loop the session.

Configuration (no config file needed):
  ALMANAC_FRICTION_NUDGE_EVERY  — remind every Nth stop (default 5).
                                   Set to 0 to SILENCE the nudge entirely.

Additive and revertable: `almanac revert` removes this rung. Stdlib-only,
Python 3.8+ compatible. Fail-open: any internal error exits 0 (a nudge that
errors must never wedge the session).
"""
import json
import os
import sys
from pathlib import Path

# Behavior marker — the distinctive token this rung emits, for idempotent
# install detection and future instantiate.py probing (never a substring a
# bystander file would mention).
NUDGE_MARKER = "almanac:friction-nudge"

DEFAULT_EVERY = 5
STATE_REL = ".almanac/friction-nudge-state.json"

REMINDER = (
    "[" + NUDGE_MARKER + "] Reminder: if anything went wrong this turn — "
    "especially a mistake you caught yourself — log it now with "
    '/friction "<one line>". Self-caught friction is the kind that goes '
    "unlogged; the loop can only correct what it can see."
)


def _project_root() -> Path:
    """Project root, anchored to this script's location (…/.claude/hooks/x.py →
    project root is parents[2]) with $CLAUDE_PROJECT_DIR as an override."""
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2]


def _every() -> int:
    raw = os.environ.get("ALMANAC_FRICTION_NUDGE_EVERY")
    if raw is None or raw == "":
        return DEFAULT_EVERY
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_EVERY


def _bump_and_read(state_path: Path) -> int:
    """Increment the persisted stop counter and return the new value.
    Best-effort: a read/parse failure resets to 1 rather than raising."""
    stops = 0
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
        stops = int(data.get("stops", 0))
    except (OSError, ValueError, TypeError):
        stops = 0
    stops += 1
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = state_path.with_suffix(state_path.suffix + ".tmp")
        tmp.write_text(json.dumps({"stops": stops}) + "\n", encoding="utf-8")
        os.replace(tmp, state_path)
    except OSError:
        pass  # counting is best-effort; never wedge the session over it
    return stops


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    # Never act on a nudge-triggered continuation (defensive — this hook never
    # blocks, but honor the platform's loop guard regardless).
    if data.get("stop_hook_active"):
        sys.exit(0)

    every = _every()
    if every <= 0:
        sys.exit(0)  # silenced by configuration

    try:
        stops = _bump_and_read(_project_root() / STATE_REL)
    except Exception:
        sys.exit(0)

    if stops % every == 0:
        print(REMINDER, file=sys.stderr)
    sys.exit(0)


if __name__ == "__main__":
    main()
