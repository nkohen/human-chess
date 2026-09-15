---
allowed-tools: Bash
description: Log a friction entry to the observe log. Usage: /friction "what just went wrong"
---

Log this friction note to the observe log. Run immediately — no confirmation, no commentary.

```bash
python3 "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}/.claude/hooks/friction_log.py" "$ARGUMENTS"
```

After the command runs, output only the printed confirmation line. Nothing else.
