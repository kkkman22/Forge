#!/usr/bin/env bash
# Test suite for persistent-loop.sh auto-advance cases
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK_SCRIPT="$PROJECT_DIR/scripts/persistent-loop.sh"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=0

assert_contains() {
  local haystack="$1" needle="$2" test_name="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    echo -e "  ${GREEN}PASS${NC} $test_name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $test_name"
    echo "    Expected to contain: $needle"
    echo "    Got: $(echo "$haystack" | head -5)"
    FAIL=$((FAIL + 1))
  fi
}

assert_empty() {
  local output="$1" test_name="$2"
  TOTAL=$((TOTAL + 1))
  if [ -z "$output" ]; then
    echo -e "  ${GREEN}PASS${NC} $test_name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} $test_name"
    echo "    Expected empty, got: $output"
    FAIL=$((FAIL + 1))
  fi
}

setup_fixtures() {
  mktemp -d
}

teardown_fixtures() {
  rm -rf "$1" 2>/dev/null || true
}

create_forge_env() {
  local tmpdir="$1"
  local phase="${2:-build}"
  local tier="${3:-standard}"
  local topic="${4:-test-task}"

  mkdir -p "$tmpdir/.tinkerman/progress"
  mkdir -p "$tmpdir/.tinkerman/reviews"
  mkdir -p "$tmpdir/.tinkerman/plans"
  mkdir -p "$tmpdir/.tinkerman/test-results"
  mkdir -p "$tmpdir/.tinkerman/ship"
  mkdir -p "$tmpdir/.tinkerman/knowledge/sessions"
  mkdir -p "$tmpdir/.tinkerman/.stop-hook-dedupe"

  cat > "$tmpdir/.tinkerman/status.md" << EOF2
---
current_task: "${topic}"
tier: "${tier}"
phase: "${phase}"
updated: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
---
EOF2
}

run_hook() {
  local tmpdir="$1"
  (cd "$tmpdir" && FORGE_DIR=".tinkerman" STATUS_FILE=".tinkerman/status.md" LOOP_STATE_FILE=".tinkerman/loop-state.md" bash "$HOOK_SCRIPT" 2>&1) || true
}

echo -e "${YELLOW}=== persistent-loop.sh Test Suite ===${NC}"

# --- Case 5: plan → build ---
echo ""
echo "Case 5: plan-approved-build-not-started"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "plan" "standard" "my-task"
cat > "$tmpdir/.tinkerman/plans/my-task.md" << 'EOF3'
---
topic: "my-task"
status: "approved"
---
EOF3
output=$(run_hook "$tmpdir")
assert_contains "$output" 'Skill(skill="tinkerman", args="build")' "plan approved → inject build"
teardown_fixtures "$tmpdir"

# --- Case 6: build → review ---
echo ""
echo "Case 6: build-done-review-missing"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "build" "standard" "my-task"
cat > "$tmpdir/.tinkerman/progress/my-task.md" << 'EOF4'
## Tasks
- [x] Task 1
- [x] Task 2
- [x] Task 3
EOF4
output=$(run_hook "$tmpdir")
assert_contains "$output" 'Skill(skill="tinkerman", args="review")' "build done → inject review"
teardown_fixtures "$tmpdir"

# --- Case 7: review → test ---
echo ""
echo "Case 7: review-pass-test-missing"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "review" "standard" "my-task"
cat > "$tmpdir/.tinkerman/reviews/my-task.md" << 'EOF5'
---
result: "pass"
p0_count: 0
p1_count: 0
---
EOF5
output=$(run_hook "$tmpdir")
assert_contains "$output" 'Skill(skill="tinkerman", args="test")' "review pass → inject test"
teardown_fixtures "$tmpdir"

# --- Case 8: test → ship ---
echo ""
echo "Case 8: test-pass-ship-missing"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "test" "standard" "my-task"
cat > "$tmpdir/.tinkerman/test-results/my-task.md" << 'EOF6'
---
result: "pass"
---
EOF6
output=$(run_hook "$tmpdir")
assert_contains "$output" 'Skill(skill="tinkerman", args="ship")' "test pass → inject ship"
teardown_fixtures "$tmpdir"

# --- Case 9: ship → learn ---
echo ""
echo "Case 9: ship-done-full-tier-learn-missing"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "ship" "full" "my-task"
cat > "$tmpdir/.tinkerman/ship/my-task.md" << 'EOF7'
---
result: "shipped"
---
EOF7
output=$(run_hook "$tmpdir")
assert_contains "$output" 'Skill(skill="tinkerman", args="learn")' "ship done full → inject learn"
teardown_fixtures "$tmpdir"

# --- Case 10: loop handoff ---
echo ""
echo "Case 10: loop-autonomous-progress-remaining"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "ship" "full" "my-task"
# Override status to add mode: autonomous
cat > "$tmpdir/.tinkerman/status.md" << 'EOF8'
---
current_task: "my-task"
tier: "full"
phase: "ship"
mode: "autonomous"
updated: "2026-05-08T12:00:00Z"
---
EOF8
cat > "$tmpdir/.tinkerman/progress/my-task.md" << 'EOF9'
## Tasks
- [x] Task 1
- [ ] Task 2
- [ ] Task 3
EOF9
output=$(run_hook "$tmpdir")
assert_contains "$output" '[LOOP HANDOFF]' "autonomous + pending → loop handoff"
teardown_fixtures "$tmpdir"

# --- Dedupe: second call silent ---
echo ""
echo "Dedupe: dedupe-second-call-silent"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "plan" "standard" "my-task"
cat > "$tmpdir/.tinkerman/plans/my-task.md" << 'EOF10'
---
topic: "my-task"
status: "approved"
---
EOF10
output1=$(run_hook "$tmpdir")
output2=$(run_hook "$tmpdir")
assert_contains "$output1" 'AUTO-ADVANCE' "first call injects"
assert_empty "$output2" "second call silent"
teardown_fixtures "$tmpdir"

# --- Stale status silent ---
echo ""
echo "Stale: stale-status-silent"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "build" "standard" "my-task"
# Make status file old
touch -t 202001010000 "$tmpdir/.tinkerman/status.md"
output=$(run_hook "$tmpdir")
assert_empty "$output" "stale status → silent"
teardown_fixtures "$tmpdir"

# --- Unknown phase silent ---
echo ""
echo "Unknown: unknown-phase-silent"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "unknown" "standard" "my-task"
output=$(run_hook "$tmpdir")
assert_empty "$output" "unknown phase → silent"
teardown_fixtures "$tmpdir"

# --- Light tier early exit ---
echo ""
echo "Light tier: light-tier-early-exit"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "plan" "light" "my-task"
cat > "$tmpdir/.tinkerman/plans/my-task.md" << 'EOF11'
---
topic: "my-task"
status: "approved"
---
EOF11
output=$(run_hook "$tmpdir")
assert_empty "$output" "light tier → no auto-advance"
teardown_fixtures "$tmpdir"

# --- Regression: Case 1 P0/P1 still works ---
echo ""
echo "Regression: existing-case1-p0p1-regression"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "review" "standard" "my-task"
cat > "$tmpdir/.tinkerman/reviews/my-task.md" << 'EOF12'
---
result: "fail"
p0_count: 1
p1_count: 2
---
EOF12
output=$(run_hook "$tmpdir")
assert_contains "$output" 'AUTO-FIX' "P0/P1 still triggers auto-fix"
teardown_fixtures "$tmpdir"

# --- Regression: Case 3 build + exhaustion still works ---
echo ""
echo "Regression: existing-case3-build-exhaustion-regression"
tmpdir=$(setup_fixtures)
create_forge_env "$tmpdir" "build" "standard" "my-task"
# Add exhaustion flag
cat > "$tmpdir/.tinkerman/status.md" << 'EOF13'
---
current_task: "my-task"
tier: "standard"
phase: "build"
exhaustion_pending: "true"
updated: "2026-05-08T12:00:00Z"
---
EOF13
cat > "$tmpdir/.tinkerman/progress/my-task.md" << 'EOF14'
## Tasks
- [x] Task 1
- [ ] Task 2
- [ ] Task 3
EOF14
output=$(run_hook "$tmpdir")
assert_contains "$output" 'BUILD 会话延续' "exhaustion still triggers resume"
teardown_fixtures "$tmpdir"

echo ""
echo -e "${YELLOW}=== Results: ${PASS}/${TOTAL} passed, ${FAIL} failed ===${NC}"
[ "$FAIL" -gt 0 ] && exit 1
exit 0
