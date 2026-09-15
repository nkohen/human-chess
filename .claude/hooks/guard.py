#!/usr/bin/env python3
"""
PreToolUse guard hook.

<!-- [Conv #2: regex-blocking PreToolUse rung]
     Trust ladder for Guardrails: notification-only < regex-blocking PreToolUse (THIS RUNG)
     < sandbox. disler/claude-code-hooks-mastery is the public exemplar for this rung. The
     regex-blocking rung raises the cost of the specific bypasses surveyed across the
     reference harnesses; it does not claim completeness (interpreter bypasses like
     `sh -c "rm -rf /"` are out of reach — pair with a sandbox for that). -->

Mechanically enforces four constraints:

1. observe/observe-log.jsonl is append-only. Write/Edit tools and destructive Bash
   targeting that file are denied. Appends (>>) remain allowed.

2. Destructive Bash commands: recursive rm in any flag spelling, `find ... -delete`,
   curl/wget piped or chained into a shell, sudo, chmod 777.

3. Run-to-completion: a Bash command may not DETACH a process from the session
   (`nohup`, `disown`, `setsid`, or a trailing `&` background operator). The
   general agent-failure class (harvest Card 3.1, n=1 MEASURED): the prose
   "run work to completion" rule MISSED when an agent backgrounded its final
   sweep, while a mechanical PreToolUse block HELD. Deliberate, session-tracked
   backgrounding via the Bash tool's own `run_in_background` parameter is NOT
   blocked — only shell-level detachment that orphans work outside the session's
   completion tracking.

4. Backgrounded-exit masking: a Bash call with run_in_background=true is blocked
   in two shapes that hide the real job's exit code from the completion callback,
   which reports the exit of the LAST command it ran.
     (a) The LAST shell STATEMENT is a bare read/echo
         (`cat`/`tail`/`head`/`echo`/`printf`/`ls`), e.g. `build > out; tail out`.
     (b) The LAST PIPELINE STAGE is a bare reader (`cat`/`tail`/`head`), e.g.
         `build | tee log | tail -60`: the callback reports the reader's exit, so
         an upstream build that died rc=1 reads as "exit 0". Harvested from
         ct-research's deployed guard, where the pipeline case reproduced 2026-08-19
         after the statement case (2026-08-07) — an external target, so citable.
   `tail -f` (a deliberate live-follow) and foreground calls are exempt in both.

MATCHING IS ON PARSED COMMANDS, NOT RAW COMMAND TEXT. A blocklist matched
against the whole command string refuses any command whose ARGUMENTS merely
mention a blocked keyword: a `git commit` whose message describes this guard is
not a destructive command, but a whole-string scan cannot tell the difference.
That false positive was observed twice on a deployed target (2026-07-15 on the
append-only rule, 2026-07-31 on the run-to-completion rule), costing a reworded
commit and a commit-through-a-file workaround. So this scanner lexes the command
into SIMPLE COMMANDS — respecting quotes, dropping heredoc bodies, splitting on
shell operators — and then matches command keywords only in COMMAND position and
protected paths only in ARGUMENT or REDIRECT position. Text a command merely
CARRIES is data, never a command. When the lexer cannot make sense of the string
(an unbalanced quote), it re-parses with quoting stripped rather than falling
back to a whole-string scan: still parsed, still command-position, never weaker
about what actually runs.

The one place that reasoning inverts: a heredoc body fed to a SHELL is not data,
it is a script, so those bodies are scanned as commands in their own right
(`bash <<EOF`, `cat <<EOF | sh`). Dropping every body unconditionally would have
turned this fix into a bypass — caught on a target before it shipped there.

Exit code 2 = PreToolUse blocking signal. Everything else exits 0 (allow).
Fail-open on internal errors: a bug here weakens defense-in-depth but never wedges
the session. The settings.json permission deny-list remains the underlying layer.
A fail-open is DIAGNOSABLE, never silent: the internal-error traceback is appended
to `.almanac/guard-debug.log` under the project root (H2, from ct-research's
2026-07-12 miss, where a silently fail-open gate let a commit through unaudited).

Stdlib-only, Python 3.8+ compatible.
"""
import datetime
import json
import os
import re
import sys
import traceback
from typing import List, Optional, Tuple

OBSERVE_LOG = "observe-log.jsonl"


def _project_root() -> str:
    """The project root: CLAUDE_PROJECT_DIR, else the tree above this hook file
    (`<root>/.claude/hooks/guard.py`). Matches observe.py / friction_log.py so a
    tool run from a subdirectory still finds the one `.almanac/` debug log."""
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return env
    return os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))))


def _debug_log(message: str) -> None:
    """Append a guard internal-error traceback to `.almanac/guard-debug.log` so a
    fail-open leaves a trace (H2). Best-effort: a logging failure must never wedge
    the guard, so every error here is swallowed."""
    try:
        d = os.path.join(_project_root(), ".almanac")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "guard-debug.log"), "a", encoding="utf-8") as f:
            f.write(message)
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Lexer — shell text to (kind, value) tokens
# ---------------------------------------------------------------------------

_OPERATOR_CHARS = frozenset("\n;|&()<>")

# Longest first: a run of operator characters is consumed greedily against this
# table, so `&&` never reads as a background `&` and `&>>` never as a truncating
# `&>`.
_OPERATORS = (
    "&>>", "&&", "||", ";;", "|&", ">>", "<<", "<&", ">&", "&>", ">|",
    "\n", ";", "|", "&", "(", ")", "<", ">",
)

_REDIRECTS = frozenset({">", ">>", "<", "<<", "<&", ">&", "&>", "&>>", ">|"})
# Redirections that DESTROY the existing contents of their target.
_TRUNCATING = frozenset({">", ">|", "&>"})

# Heredoc introducer: `<<EOF`, `<<-EOF`, `<<'EOF'`, `<< "EOF"`. Its BODY is data
# fed to a command's stdin, never commands, so the body lines are dropped before
# lexing. (`<<<` here-strings do not match: no identifier follows the third `<`.)
_HEREDOC_RE = re.compile(r"<<-?[ \t]*(?P<q>['\"]?)(?P<d>[A-Za-z_][A-Za-z0-9_]*)(?P=q)")

_ASSIGN_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")

# Commands that RUN another command given as their arguments. `sudo rm -r x`,
# `xargs rm -rf` and `timeout 5 rm -r x` all really run `rm`, so a check that
# looked only at the first word of a simple command would miss them.
_WRAPPERS = frozenset({
    "sudo", "doas", "env", "nohup", "setsid", "time", "timeout", "nice",
    "ionice", "xargs", "command", "exec", "builtin", "stdbuf", "chroot",
})

# Command names any check below cares about. Inside a WRAPPER's arguments the
# wrapped command is found by looking for one of these rather than by counting
# flags — `xargs -I {} rm -rf {}` has no parseable flag grammar, and guessing
# which flags take a value is how `sudo -u alice rm -rf /` slips through.
_TRACKED = frozenset({
    "rm", "find", "chmod", "curl", "wget", "mv", "truncate", "sed", "tee",
    "disown",
})

_SHELLS = frozenset({"sh", "bash", "zsh", "ksh", "dash", "fish"})
# Separators that hand a downloader's output straight to a shell.
_PIPE_INTO = frozenset({"|", "|&", "&&", ";"})
# A heredoc whose introducing line names a shell feeds that shell a SCRIPT, so
# its body is commands and must be scanned. Everything else receives DATA.
_SHELL_ON_LINE_RE = re.compile(r"\b(?:" + "|".join(sorted(_SHELLS)) + r")\b")
_MAX_HEREDOC_DEPTH = 4       # a script body may itself carry a heredoc


class _LexError(Exception):
    """The command could not be lexed (an unbalanced quote)."""


def _strip_heredocs(cmd: str) -> Tuple[str, List[str]]:
    """Split a command into (text with heredoc bodies removed, bodies a SHELL
    will execute).

    A heredoc body is a command's INPUT. Fed to `cat`, to `python`, or into a
    commit message it is DATA, and scanning it is the false positive this
    guard exists to avoid. Fed to a shell — `bash <<EOF`, `cat <<EOF | sh` —
    it is a SCRIPT, and dropping it would let every blocked command through
    inside one. So bodies are dropped EXCEPT where the introducing line names
    a shell, and those are returned to be scanned as commands in their own
    right. (Naming a shell on the line is the test; `cat <<EOF | grep bash`
    therefore gets its body scanned too — a body scanned unnecessarily is the
    cheaper error.)
    """
    lines = cmd.split("\n")
    out = []  # type: List[str]
    scripts = []  # type: List[str]
    i = 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        delims = [m.group("d") for m in _HEREDOC_RE.finditer(line)]
        executed = bool(delims) and _SHELL_ON_LINE_RE.search(line) is not None
        i += 1
        for delim in delims:
            start = i
            while i < len(lines) and lines[i].strip() != delim:
                i += 1
            if executed:
                scripts.append("\n".join(lines[start:i]))
            i += 1  # drop the terminator line as well
    return "\n".join(out), scripts


def _lex(cmd: str) -> List[Tuple[str, str]]:
    """Lex shell text into ``("word", value)`` / ``("op", operator)`` tokens.

    A quoted span contributes its VALUE to the surrounding word and can never be
    read as an operator — that is the whole point: `echo "&"` backgrounds
    nothing, and a keyword inside a quoted argument is data.
    """
    tokens = []  # type: List[Tuple[str, str]]
    word = []  # type: List[str]
    started = [False]  # a quoted empty string is still a word

    def flush():
        if started[0]:
            tokens.append(("word", "".join(word)))
            del word[:]
            started[0] = False

    i, n = 0, len(cmd)
    while i < n:
        c = cmd[i]
        if c in " \t\r":
            flush()
            i += 1
        elif c == "'":
            j = cmd.find("'", i + 1)
            if j < 0:
                raise _LexError("unbalanced single quote")
            word.append(cmd[i + 1:j])
            started[0] = True
            i = j + 1
        elif c == '"':
            j, buf = i + 1, []
            while j < n and cmd[j] != '"':
                if cmd[j] == "\\" and j + 1 < n and cmd[j + 1] in '\\"$`\n':
                    if cmd[j + 1] != "\n":  # backslash-newline is a continuation
                        buf.append(cmd[j + 1])
                    j += 2
                else:
                    buf.append(cmd[j])
                    j += 1
            if j >= n:
                raise _LexError("unbalanced double quote")
            word.append("".join(buf))
            started[0] = True
            i = j + 1
        elif c == "\\" and i + 1 < n:
            if cmd[i + 1] != "\n":  # backslash-newline is a line continuation
                word.append(cmd[i + 1])
                started[0] = True
            i += 2
        elif c in _OPERATOR_CHARS:
            flush()
            for op in _OPERATORS:
                if cmd.startswith(op, i):
                    tokens.append(("op", op))
                    i += len(op)
                    break
            else:  # pragma: no cover - every operator char starts an operator
                i += 1
        else:
            word.append(c)
            started[0] = True
            i += 1
    flush()
    return tokens


def _simple_commands(
    tokens: List[Tuple[str, str]]
) -> List[Tuple[List[str], List[Tuple[str, str]], str]]:
    """Group tokens into ``(words, redirects, terminator)`` simple commands.

    ``terminator`` is the operator that ENDED the command (``"&"`` for a
    backgrounded one, ``"|"`` when it pipes into the next, ``""`` at the end).
    """
    cmds = []  # type: List[Tuple[List[str], List[Tuple[str, str]], str]]
    words = []  # type: List[str]
    redirects = []  # type: List[Tuple[str, str]]

    def flush(terminator):
        if words or redirects:
            cmds.append((list(words), list(redirects), terminator))
        del words[:]
        del redirects[:]

    i = 0
    while i < len(tokens):
        kind, val = tokens[i]
        if kind == "word":
            words.append(val)
            i += 1
        elif val in _REDIRECTS:
            target = ""
            if i + 1 < len(tokens) and tokens[i + 1][0] == "word":
                target = tokens[i + 1][1]
                i += 1
            redirects.append((val, target))
            i += 1
        else:
            flush(val)
            i += 1
    flush("")
    return cmds


def _lex_commands(text: str) -> List[Tuple[List[str], List[Tuple[str, str]], str]]:
    """Lex one piece of shell text, tolerating broken quoting.

    Text the lexer rejects is re-lexed with every quote character removed:
    degraded (quoted content becomes bare words) but still command-position —
    never a whole-string keyword scan."""
    try:
        return _simple_commands(_lex(text))
    except _LexError:
        return _simple_commands(_lex(re.sub(r"['\"]", " ", text)))


def _parse(cmd: str) -> List[Tuple[List[str], List[Tuple[str, str]], str]]:
    """Parse a Bash command into simple commands — including the commands
    inside any heredoc body a shell is going to execute."""
    cmds = []  # type: List[Tuple[List[str], List[Tuple[str, str]], str]]
    pending = [cmd]
    for _depth in range(_MAX_HEREDOC_DEPTH):
        if not pending:
            break
        nxt = []  # type: List[str]
        for text in pending:
            stripped, scripts = _strip_heredocs(text)
            cmds.extend(_lex_commands(stripped))
            nxt.extend(scripts)
        pending = nxt
    return cmds


def _basename(word: str) -> str:
    return word.replace("\\", "/").rsplit("/", 1)[-1]


def _invocations(words: List[str]) -> List[Tuple[str, List[str]]]:
    """Return ``(name, args)`` for a simple command and any command it WRAPS."""
    out = []  # type: List[Tuple[str, List[str]]]
    i = 0
    while i < len(words) and _ASSIGN_RE.match(words[i]):
        i += 1  # leading VAR=value assignments are not the command
    while i < len(words) and len(out) < 4:
        out.append((words[i], words[i + 1:]))
        if _basename(words[i]) not in _WRAPPERS:
            break
        wrapped = None
        for j in range(i + 1, len(words)):
            if _basename(words[j]) in _TRACKED or _basename(words[j]) in _WRAPPERS:
                wrapped = j
                break
        if wrapped is None:
            break
        i = wrapped
    return out


def _all_invocations(cmds) -> List[Tuple[int, str, List[str]]]:
    return [(idx, name, args)
            for idx, (words, _r, _t) in enumerate(cmds)
            for name, args in _invocations(words)]


def _has_short_flag(args: List[str], letter: str, *long: str) -> bool:
    for tok in args:
        if tok in long:
            return True
        if tok.startswith("-") and not tok.startswith("--") and letter in tok:
            return True
    return False


def _mutates_observe_log(cmds) -> Optional[str]:
    """Return a reason if a Bash command would destructively change the log."""
    for words, redirects, _term in cmds:
        for op, target in redirects:
            if op in _TRUNCATING and _basename(target) == OBSERVE_LOG:
                return "truncating redirect (>) to observe-log.jsonl"
        for name, args in _invocations(words):
            base = _basename(name)
            if not any(_basename(a) == OBSERVE_LOG for a in args):
                continue
            if base in ("rm", "mv", "truncate"):
                return "%s targeting observe-log.jsonl" % base
            if base == "sed" and _has_short_flag(args, "i", "--in-place"):
                return "sed -i targeting observe-log.jsonl"
            if base == "tee" and not _has_short_flag(args, "a", "--append"):
                return "tee without --append targeting observe-log.jsonl"
    return None


def _is_recursive_rm(name: str, args: List[str]) -> bool:
    if _basename(name) != "rm":
        return False
    for tok in args:
        if tok.startswith("--recursive"):
            return True
        if tok.startswith("-") and not tok.startswith("--") and (
            "r" in tok or "R" in tok
        ):
            return True
    return False


def _destructive(cmds) -> Optional[str]:
    invocations = _all_invocations(cmds)
    for _idx, name, args in invocations:
        if _is_recursive_rm(name, args):
            return "recursive rm (rm -r / -R / -fr / --recursive, in any spelling)"
    for _idx, name, args in invocations:
        if _basename(name) == "find" and "-delete" in args:
            return "find ... -delete"
    for idx, name, _args in invocations:
        if _basename(name) not in ("curl", "wget"):
            continue
        if cmds[idx][2] not in _PIPE_INTO or idx + 1 >= len(cmds):
            continue
        for nxt_name, _ in _invocations(cmds[idx + 1][0]):
            if _basename(nxt_name) in _SHELLS:
                return "curl/wget piped or chained into a shell"
    for _idx, name, _args in invocations:
        if _basename(name) == "sudo":
            return "sudo / privilege escalation"
    for _idx, name, args in invocations:
        if _basename(name) == "chmod" and any(a in ("777", "0777") for a in args):
            return "chmod 777"
    return None


def _detaches(cmds) -> Optional[str]:
    """Return a reason if a Bash command would DETACH work from the session.

    Run-to-completion (Card 3.1): the constructs below orphan a process so it
    outlives the tool call — the exact failure the prose rule missed. Only a
    command-position ``nohup``/``disown``/``setsid`` and a real background ``&``
    operator count; ``&&``, ``&>``/``>&`` redirects and ``2>&1`` are separate
    operators to the lexer, and a keyword inside an argument is data. The Bash
    tool's own ``run_in_background`` parameter is the session-tracked path and is
    intentionally NOT matched here."""
    for _idx, name, _args in _all_invocations(cmds):
        base = _basename(name)
        if base in ("nohup", "disown", "setsid"):
            return "%s (detaches the process from the session)" % base
    for _words, _redirects, term in cmds:
        if term == "&":
            return "trailing '&' backgrounding (orphans work the session must finish)"
    return None


# Statement separators (a pipeline `a | b` is ONE statement, so `|`/`|&` are not
# here): the "last statement" is the run of simple commands after the last of
# these. A bare read as that statement's leading command masks a backgrounded
# job's exit.
_STMT_SEP = frozenset({";", "&", "&&", "||", "\n"})
_TRAILING_READS = frozenset({"cat", "tail", "head", "less", "echo", "printf",
                             "ls"})
# Pipe SINKS that swallow a pipeline's real exit: `a | b` reports b's exit code,
# so `build | tail` reports the reader's 0 even when the build died. Restricted
# to the readers that legitimately sink a pipeline (H4, ct-research 2026-08-19);
# echo/printf/ls are not pipe sinks and stay out to avoid `x | echo`-style noise.
_PIPE_MASK_READS = frozenset({"cat", "tail", "head"})

_BG_MASK_MSG = (
    "run_in_background call whose last shell statement is a bare read/echo "
    "(cat/tail/head/less/echo/printf/ls). The completion callback reports the "
    "exit code of the LAST command, so the trailing read MASKS the real job's "
    "status — an OOM / SIGKILL / error reads as 'exit 0'. End the command at "
    "the redirect (`... > out 2>&1`) and Read the output file on the callback; "
    "drop the trailing read. (`tail -f` and foreground calls are exempt.)"
)

_BG_PIPE_MASK_MSG = (
    "run_in_background pipeline whose LAST stage is a bare reader "
    "(cat/tail/head), e.g. `build | tee log | tail -60`. A pipeline reports the "
    "exit code of its LAST stage, so the reader's 'exit 0' MASKS a job that died "
    "upstream (this exact shape reported success on a failed build). Drop the "
    "trailing `| tail/head/cat`: redirect the job to a file (`... > out 2>&1`) "
    "and Read it on the callback. (`tail -f` is exempt.)"
)


def _last_statement(cmds):
    """The simple commands of the LAST shell statement (the run after the last
    statement separator; pipes do NOT separate statements, so a pipeline is one
    statement). Returns ``(start_index, stmt_cmds)``."""
    start = 0
    for i in range(len(cmds) - 1):
        if cmds[i][2] in _STMT_SEP:
            start = i + 1
    return start, cmds[start:]


def _bg_exit_mask(cmds, tool_input: dict) -> Optional[str]:
    """A run_in_background Bash call that hides the real job's exit from the
    completion callback, in either of two shapes (see docstring constraint 4).

    Harvested from ct-research's deployed guard (an external target). Fires ONLY
    for the Bash tool's ``run_in_background=true``, because only there does the
    callback report the last command's exit as the job's status.
      (a) the last STATEMENT is a bare read/echo following a real preceding
          statement (`build > out; tail out`); a lone read as the WHOLE command
          masks nothing, so ``start == 0`` in the non-pipeline case is exempt.
      (b) the last PIPELINE STAGE is a bare reader (`build | tail`), which masks
          even as the single whole statement — the H4 extension (2026-08-19).
    ``tail -f`` is a deliberate live-follow and is exempt in both shapes."""
    if not (isinstance(tool_input, dict)
            and tool_input.get("run_in_background") is True):
        return None
    if not cmds:
        return None
    start, stmt = _last_statement(cmds)
    if not stmt:
        return None
    is_pipeline = len(stmt) > 1     # its stages are joined by | / |& only
    if is_pipeline:
        invs = _invocations(stmt[-1][0])   # the last pipeline stage
        if not invs:
            return None
        base = _basename(invs[0][0])
        if base not in _PIPE_MASK_READS:
            return None
        if base == "tail" and _has_short_flag(invs[0][1], "f"):
            return None
        return _BG_PIPE_MASK_MSG
    if start == 0:                  # a lone read is the whole command — no mask
        return None
    invs = _invocations(stmt[0][0])
    if not invs:
        return None
    name, args = invs[0]
    base = _basename(name)
    if base not in _TRAILING_READS:
        return None
    if base == "tail" and _has_short_flag(args, "f"):   # live follow, allow
        return None
    return _BG_MASK_MSG


def evaluate(tool_name: str, tool_input: dict) -> Optional[str]:
    if tool_name in ("Write", "Edit"):
        path = (tool_input.get("file_path") or tool_input.get("path") or "")
        if path.replace("\\", "/").endswith(OBSERVE_LOG):
            return (
                "observe-log.jsonl is append-only; the Write/Edit tools may not "
                "modify it. Record signal via /friction or the python append-hooks."
            )
        return None

    if tool_name == "Bash":
        cmds = _parse(tool_input.get("command", "") or "")
        reason = _mutates_observe_log(cmds)
        if reason:
            return f"Blocked: {reason}. observe-log.jsonl is append-only."
        reason = _destructive(cmds)
        if reason:
            return f"Blocked destructive command: {reason}."
        reason = _detaches(cmds)
        if reason:
            return (
                f"Blocked detached/backgrounded command: {reason}. Run work to "
                "completion; for a deliberate long-running process use the Bash "
                "tool's run_in_background parameter, which the session tracks."
            )
        reason = _bg_exit_mask(cmds, tool_input)
        if reason:
            return f"Blocked: {reason}"
        return None

    return None


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {}) or {}
    try:
        reason = evaluate(tool_name, tool_input)
    except Exception as exc:
        _debug_log(
            "[%s] guard internal error on tool %r (allowing): %s\n%s\n"
            % (datetime.datetime.now().isoformat(), tool_name, exc,
               traceback.format_exc()))
        print(f"guard hook internal error (allowing): {exc} "
              f"(traceback in .almanac/guard-debug.log)", file=sys.stderr)
        sys.exit(0)
    if reason:
        print(reason, file=sys.stderr)
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
