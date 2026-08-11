#!/usr/bin/env bash
# test/hook-check-frozen.test.sh — Shell tests for frozen-zone hooks.
#
# Run: bash test/hook-check-frozen.test.sh
#
# Tests: classify_path, emit_frozen_diagnostic, PreToolUse deny/allow,
#        PostToolUse breach detection, feature flag, config fallback.
set -euo pipefail

PASS=0
FAIL=0
TOTAL=0

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "${script_dir}/.." && pwd)"

# Source zone-registry.sh
source "${project_dir}/scripts/zone-registry.sh"

cd "$project_dir"

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc — expected [$expected], got [$actual]"
  fi
}

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$haystack" == *"$needle"* ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc — expected to contain [$needle] in [${haystack:0:100}]"
  fi
}

assert_exit() {
  local desc="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc — expected exit $expected, got $actual"
  fi
}

# ---------------------------------------------------------------------------
# classify_path tests
# ---------------------------------------------------------------------------

echo "=== classify_path tests ==="

# Clear cache before each test group
unset ZONE_REGISTRY_CACHE 2>/dev/null || true

# T1: config.md → frozen-config
result=$(classify_path ".tinkerman/config.md")
assert_eq "config.md is frozen-config" "frozen-config CONFIG_ROOT" "$result"

# T2: approved plan → frozen-plan
result=$(classify_path ".tinkerman/plans/frozen-zone-structured-feedback.md")
assert_eq "approved plan is frozen-plan" "frozen-plan PLAN_APPROVED" "$result"

# T3: non-existent spec (no status file) → none (status qualifier fails)
unset ZONE_REGISTRY_CACHE
result=$(classify_path ".tinkerman/specs/nonexistent/spec.md")
assert_eq "non-existent spec is none" "none NONE" "$result"

# T4: progress file → guarded-append
unset ZONE_REGISTRY_CACHE
result=$(classify_path ".tinkerman/progress/task.md")
assert_eq "progress is guarded-append" "guarded-append GUARDED_APPEND_VIOLATION" "$result"

# T5: reviews file → guarded-append (actually guarded, depending on parse)
unset ZONE_REGISTRY_CACHE
result=$(classify_path ".tinkerman/reviews/r1.md")
assert_eq "reviews is guarded-append" "guarded-append GUARDED_APPEND_VIOLATION" "$result"

# T6: src file → none
unset ZONE_REGISTRY_CACHE
result=$(classify_path "src/main.ts")
assert_eq "src file is none" "none NONE" "$result"

# T7: findings → none (open zone)
unset ZONE_REGISTRY_CACHE
result=$(classify_path ".tinkerman/findings/note.md")
assert_eq "findings is none (open)" "none NONE" "$result"

# T8: status.md → none (open zone)
unset ZONE_REGISTRY_CACHE
result=$(classify_path ".tinkerman/status.md")
assert_eq "status.md is none (open)" "none NONE" "$result"

# T9: knowledge/instincts.md → guarded (file-specific rule)
unset ZONE_REGISTRY_CACHE
result=$(classify_path ".tinkerman/knowledge/instincts.md")
assert_eq "instincts.md is guarded" "guarded-append GUARDED_APPEND_VIOLATION" "$result"

# ---------------------------------------------------------------------------
# emit_frozen_diagnostic tests
# ---------------------------------------------------------------------------

echo "=== emit_frozen_diagnostic tests ==="

# T10: frozen-config diagnostic
diag=$(emit_frozen_diagnostic ".tinkerman/config.md" "frozen-config" "CONFIG_ROOT")
assert_contains "config diagnostic has category" "$diag" '"category":"frozen-config"'
assert_contains "config diagnostic has reason_code" "$diag" '"reason_code":"CONFIG_ROOT"'
assert_contains "config diagnostic has path" "$diag" '"path":".tinkerman/config.md"'

# T11: frozen-spec diagnostic with suggested alt
diag=$(emit_frozen_diagnostic ".tinkerman/specs/foo/spec.md" "frozen-spec" "SPEC_LOCKED")
assert_contains "spec diagnostic has category" "$diag" '"category":"frozen-spec"'
assert_contains "spec diagnostic has suggested_alt" "$diag" "suggested_alternative_path"

# T12: guarded-append diagnostic
diag=$(emit_frozen_diagnostic ".tinkerman/progress/task.md" "guarded-append" "GUARDED_APPEND_VIOLATION")
assert_contains "guarded diagnostic has category" "$diag" '"category":"guarded-append"'

# ---------------------------------------------------------------------------
# PreToolUse hook tests
# ---------------------------------------------------------------------------

echo "=== PreToolUse hook tests ==="

# T13: deny frozen-config
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":".tinkerman/config.md"}}' | FORGE_STRUCTURED_FROZEN=1 bash scripts/hook-check-frozen-structured.sh 2>/dev/null)
assert_contains "PreToolUse denies config.md" "$output" '"deny"'
assert_contains "PreToolUse has systemMessage" "$output" "systemMessage"

# T14: allow open zone
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":"src/main.ts"}}' | FORGE_STRUCTURED_FROZEN=1 bash scripts/hook-check-frozen-structured.sh 2>/dev/null)
exit_code=$?
assert_exit "PreToolUse allows src file" 0 "$exit_code"
# No output means allow
assert_eq "PreToolUse allow produces no output" "" "$output"

# T15: deny approved plan
output=$(echo '{"tool_name":"Edit","tool_input":{"file_path":".tinkerman/plans/frozen-zone-structured-feedback.md"}}' | FORGE_STRUCTURED_FROZEN=1 bash scripts/hook-check-frozen-structured.sh 2>/dev/null)
assert_contains "PreToolUse denies approved plan" "$output" '"deny"'

# T16: allow unknown tool type
output=$(echo '{"tool_name":"Read","tool_input":{"file_path":".tinkerman/config.md"}}' | FORGE_STRUCTURED_FROZEN=1 bash scripts/hook-check-frozen-structured.sh 2>/dev/null)
exit_code=$?
assert_exit "PreToolUse allows Read tool" 0 "$exit_code"

# ---------------------------------------------------------------------------
# PostToolUse hook tests
# ---------------------------------------------------------------------------

echo "=== PostToolUse hook tests ==="

# T17: breach detection on frozen file
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":".tinkerman/config.md"},"tool_response":{"success":true}}' | FORGE_STRUCTURED_FROZEN=1 bash scripts/hook-check-frozen-post.sh 2>/dev/null)
assert_contains "PostToolUse detects breach" "$output" "frozen-zone violation"
assert_contains "PostToolUse has updatedToolOutput" "$output" "updatedToolOutput"

# T18: pass-through for open zone
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":"src/main.ts"},"tool_response":{"success":true}}' | FORGE_STRUCTURED_FROZEN=1 bash scripts/hook-check-frozen-post.sh 2>/dev/null)
exit_code=$?
assert_exit "PostToolUse allows open zone" 0 "$exit_code"
assert_eq "PostToolUse open zone no output" "" "$output"

# T19: skip failed tool
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":".tinkerman/config.md"},"tool_response":{"success":false}}' | FORGE_STRUCTURED_FROZEN=1 bash scripts/hook-check-frozen-post.sh 2>/dev/null)
exit_code=$?
assert_exit "PostToolUse skips failed tool" 0 "$exit_code"

# ---------------------------------------------------------------------------
# Feature flag tests
# ---------------------------------------------------------------------------

echo "=== Feature flag tests ==="

# T20: FORGE_STRUCTURED_FROZEN=0 delegates to legacy
# Legacy mode uses the existing TS hook, which exits 0 for non-frozen files
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":"src/main.ts"}}' | FORGE_STRUCTURED_FROZEN=0 bash scripts/hook-check-frozen-structured.sh 2>/dev/null || true)
exit_code=$?
# In legacy mode, the TS hook is called with $FILE which is empty from stdin
# It should exit 0 (no file arg)
assert_exit "Legacy mode exits cleanly" 0 "$exit_code"

# ---------------------------------------------------------------------------
# print-zone-registry tests
# ---------------------------------------------------------------------------

echo "=== print-zone-registry tests ==="

# T21: registry outputs rules
output=$(bash scripts/print-zone-registry.sh 2>/dev/null)
assert_contains "Registry has frozen-spec" "$output" "frozen-spec"
assert_contains "Registry has frozen-plan" "$output" "frozen-plan"
assert_contains "Registry has frozen-config" "$output" "frozen-config"

# T22: JSON mode
output=$(bash scripts/print-zone-registry.sh --json 2>/dev/null)
assert_contains "JSON registry is array" "$output" '"glob"'
assert_contains "JSON registry has categories" "$output" '"category"'

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "========================================="
echo "Results: ${PASS}/${TOTAL} passed, ${FAIL} failed"
echo "========================================="

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
