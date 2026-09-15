#!/usr/bin/env bash
# almanac:guard-selftest
# guard.selftest.sh — exercise guard.py through the REAL stdin path.
#
# Harvested from ct-research (an external target): a PreToolUse guard is tested
# by piping the hook-input JSON to the script and asserting its EXIT CODE, never
# by importing and calling its functions. ct-research shipped a claim-audit gate
# whose functions passed their unit tests while the script, driven by real
# stdin, fell open silently (2026-07-12) — the failure this self-test exists to
# catch. Four branches: allow, block, bypass (a blocked keyword as DATA), and
# malformed stdin (must fail OPEN, exit 0, never wedge the session).
#
# Exit 0 = all branches passed; exit 1 = a branch regressed (prints which).
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD="$HERE/guard.py"
fails=0

# run <expected-exit> <label> <json-on-stdin>
run() {
  local want="$1" label="$2" json="$3" got
  printf '%s' "$json" | python3 "$GUARD" >/dev/null 2>&1
  got=$?
  if [ "$got" != "$want" ]; then
    echo "FAIL [$label]: expected exit $want, got $got"
    fails=$((fails + 1))
  else
    echo "ok   [$label] (exit $got)"
  fi
}

# 1. ALLOW — a benign command exits 0.
run 0 allow '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'

# 2. BLOCK — a recursive rm is refused with the exit-2 blocking signal.
run 2 block-rm '{"tool_name":"Bash","tool_input":{"command":"rm -rf build"}}'

# 2b. BLOCK — a Write/Edit to the append-only observe log is refused.
run 2 block-observe-write \
  '{"tool_name":"Write","tool_input":{"file_path":"observe/observe-log.jsonl"}}'

# 3. BYPASS — a blocked keyword appearing only as DATA (a commit message) is
#    parsed as an argument, not a command, and is allowed.
run 0 bypass-commit-msg \
  '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"do not rm -rf the cache\""}}'

# 4. MALFORMED — non-JSON stdin must fail OPEN (exit 0), never wedge the session.
run 0 malformed-stdin 'this is not json'

if [ "$fails" -eq 0 ]; then
  echo "guard.selftest: all branches passed"
  exit 0
fi
echo "guard.selftest: $fails branch(es) FAILED"
exit 1
