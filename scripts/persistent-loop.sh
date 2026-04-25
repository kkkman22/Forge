#!/usr/bin/env bash
#
# Forge Persistent Loop — Stop Hook
#
# Prevents Claude from stopping when there are unresolved P0/P1 issues
# after review, automatically triggering a build→review→fix cycle.
#
# Mechanism:
#   1. Registered on the "Stop" event in hooks.json
#   2. Reads .forge/status.md for current phase and loop state
#   3. If review found P0/P1 and auto-fix loop is active, blocks the stop
#   4. Injects a reminder to fix issues and re-review
#
# Safety:
#   - Max 3 fix iterations (prevents infinite loops)
#   - Stale state (>2 hours) is ignored
#   - User abort (Ctrl+C) is never blocked
#   - Context limit stops are never blocked

set -euo pipefail

FORGE_DIR=".forge"
STATUS_FILE="$FORGE_DIR/status.md"
LOOP_STATE_FILE="$FORGE_DIR/loop-state.md"

MAX_FIX_ITERATIONS=3
STALE_THRESHOLD_MINUTES=120

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Read a YAML frontmatter field from a .md file
read_field() {
  local file="$1"
  local field="$2"
  if [ ! -f "$file" ]; then
    echo ""
    return
  fi
  grep "^${field}:" "$file" 2>/dev/null | head -1 | sed "s/^${field}: *\"\\{0,1\\}//;s/\"\\{0,1\\} *$//" || echo ""
}

# Check if a file was modified within the last N minutes
is_fresh() {
  local file="$1"
  local max_age_minutes="$2"
  if [ ! -f "$file" ]; then
    return 1
  fi
  # macOS and Linux compatible: use find
  local count
  count=$(find "$file" -mmin "-${max_age_minutes}" 2>/dev/null | wc -l | tr -d ' ')
  [ "$count" -gt 0 ]
}

# Count P0+P1 issues in the most recent review file
count_blocking_issues() {
  local review_dir="$FORGE_DIR/reviews"
  if [ ! -d "$review_dir" ]; then
    echo "0"
    return
  fi
  # Find the most recent review file
  local latest
  latest=$(ls -t "$review_dir"/*.md 2>/dev/null | head -1)
  if [ -z "$latest" ]; then
    echo "0"
    return
  fi
  local p0 p1
  p0=$(read_field "$latest" "p0_count")
  p1=$(read_field "$latest" "p1_count")
  p0=${p0:-0}
  p1=${p1:-0}
  echo $(( p0 + p1 ))
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# Exit silently if no .forge directory
if [ ! -d "$FORGE_DIR" ]; then
  exit 0
fi

# Exit silently if no status file
if [ ! -f "$STATUS_FILE" ]; then
  exit 0
fi

# Check if status file is stale
if ! is_fresh "$STATUS_FILE" "$STALE_THRESHOLD_MINUTES"; then
  exit 0
fi

# Read current state
current_phase=$(read_field "$STATUS_FILE" "phase")
current_tier=$(read_field "$STATUS_FILE" "tier")
auto_fix_active=$(read_field "$LOOP_STATE_FILE" "auto_fix_active")
fix_iteration=$(read_field "$LOOP_STATE_FILE" "fix_iteration")
fix_iteration=${fix_iteration:-0}

# Only activate for standard and full tiers (light path is too simple for auto-fix)
if [ "$current_tier" = "light" ]; then
  exit 0
fi

# Case 1: Review just completed with P0/P1 issues → activate auto-fix loop
if [ "$current_phase" = "review" ] || [ "$current_phase" = "test" ]; then
  blocking_count=$(count_blocking_issues)
  
  if [ "$blocking_count" -gt 0 ]; then
    # Check if we've exceeded max iterations
    if [ "$fix_iteration" -ge "$MAX_FIX_ITERATIONS" ]; then
      # Max iterations reached — let Claude stop, but warn
      echo "⚠️ 自动修复已达最大迭代次数（${MAX_FIX_ITERATIONS}）。仍有 ${blocking_count} 个 P0/P1 问题未解决。"
      echo "请手动修复后运行 /forge review 重新评审。"
      # Clean up loop state
      rm -f "$LOOP_STATE_FILE" 2>/dev/null
      exit 0
    fi
    
    # Activate or continue the fix loop
    new_iteration=$((fix_iteration + 1))
    cat > "$LOOP_STATE_FILE" << EOF
---
auto_fix_active: "true"
fix_iteration: "${new_iteration}"
max_iterations: "${MAX_FIX_ITERATIONS}"
updated: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
---

## Auto-Fix Loop Active

Iteration ${new_iteration}/${MAX_FIX_ITERATIONS}. Review found ${blocking_count} P0/P1 issues.
EOF

    echo "🔄 [AUTO-FIX 循环 ${new_iteration}/${MAX_FIX_ITERATIONS}] Review 发现 ${blocking_count} 个 P0/P1 问题。"
    echo ""
    echo "请执行以下步骤："
    echo "1. 读取 .forge/reviews/ 中最新的评审报告，查看 P0/P1 问题详情"
    echo "2. 修复所有 P0/P1 问题"
    echo "3. 运行 /forge review 重新评审"
    echo ""
    echo "修复完成且评审通过后，流程将自动继续到下一阶段。"
    echo "如需手动退出循环，运行 /forge abort。"
    exit 0
  fi
fi

# Case 2: Review passed (no P0/P1) → clean up loop state if it exists
if [ "$auto_fix_active" = "true" ]; then
  blocking_count=$(count_blocking_issues)
  if [ "$blocking_count" -eq 0 ]; then
    rm -f "$LOOP_STATE_FILE" 2>/dev/null
    echo "✅ 自动修复循环完成。所有 P0/P1 问题已解决。"
    exit 0
  fi
fi

exit 0
