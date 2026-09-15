# Security Rules

<!-- [Conv #2: regex-blocking PreToolUse rung]
     These constraints are mechanically enforced by .claude/hooks/guard.py
     (the regex-blocking PreToolUse rung of the Guardrails trust ladder). -->

The guard matches on PARSED commands, not raw command text: a blocked keyword
appearing inside a quoted argument, a commit message, or a heredoc body is data
and is not blocked. Write what you mean; do not reword a message to get past it.

## Secrets and credentials

Never read, write, echo, or log `.env`, `.env.*`, or files under `secrets/`.
Never hardcode API keys, tokens, or passwords in source files.

## Destructive commands

Never run `rm -rf`, `rm -r`, or any recursive delete.
Never run `sudo` or privilege escalation.
Never pipe `curl`/`wget` output directly to `bash` or `sh`.

Mechanically enforced by the PreToolUse guard hook (`.claude/hooks/guard.py`),
which blocks recursive `rm` in any flag spelling, `find ... -delete`, curl/wget
piped or chained into a shell, `sudo`, and `chmod 777`.

## Run to completion

Finish work you start in the session; never detach it. Never `nohup`, `disown`,
`setsid`, or trail a command with `&` to background it — that orphans work the
session must complete. For a deliberate long-running process, use the Bash
tool's `run_in_background` parameter, which the session tracks.

Mechanically enforced: the guard hook blocks `nohup`, `disown`, `setsid`, and a
trailing `&` background operator (but not `&&`, redirects, or the tracked
`run_in_background` parameter).

When you DO use `run_in_background`, never end the command with a bare read or
echo (`; cat out`, `; echo done`, `; tail log`). The completion callback reports
the exit code of the LAST command, so a trailing read makes an OOM'd or killed
job report success. End at the redirect (`… > out 2>&1`) and Read the output
file on the callback instead. (`tail -f` and foreground reads are fine.)

Mechanically enforced: the guard hook blocks a `run_in_background` command whose
last shell statement is a bare read/echo.

## Observe log hygiene

Never modify or delete entries in `observe/observe-log.jsonl` — it is append-only.
Never write fake or backdated friction entries.

Mechanically enforced: the guard hook denies Write/Edit tools on `observe-log.jsonl`.
Appends (`>>`) and the python append-hooks remain allowed.
