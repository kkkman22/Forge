#!/usr/bin/env bash
# test/run-decide-poc.test.sh — Mock test for run-decide-poc.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PASS=0
FAIL=0

assert() {
  local desc="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS + 1))
  else
    echo "FAIL: $desc — expected '$expected', got '$actual'"
    FAIL=$((FAIL + 1))
  fi
}

# Test: script is syntactically valid
bash -n "$ROOT/scripts/run-decide-poc.sh"
assert "run-decide-poc.sh syntax" "valid" "valid"

# Test: parser is syntactically valid
node -c "$ROOT/scripts/parse-decide-poc-metrics.mjs" > /dev/null 2>&1
assert "parse-decide-poc-metrics.mjs syntax" "valid" "valid"

# Test: parser requires topic-id argument
OUTPUT=$(node "$ROOT/scripts/parse-decide-poc-metrics.mjs" 2>&1 || true)
assert "parser requires topic-id" "$OUTPUT" "Usage: node scripts/parse-decide-poc-metrics.mjs <topic-id>"

# Test: script requires topic-id argument
OUTPUT=$(bash "$ROOT/scripts/run-decide-poc.sh" 2>&1 || true)
if echo "$OUTPUT" | grep -q "Usage"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: script should show usage without topic-id"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
