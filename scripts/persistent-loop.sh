#!/usr/bin/env bash
#
# Forge Persistent Loop — Stop Hook
#
# Prevents Claude from stopping when there are unresolved P0/P1 issues
# after review, automatically triggering a build→review→fix cycle.
# Also detects build-phase context exhaustion and injects resume commands.
#
# Mechanism:
#   1. Registered on the "Stop" event in hooks.json
#   2. Reads .forge/status.md for current phase and loop state
#   3. If review found P0/P1 and auto-fix loop is active, blocks the stop
#   4. If build has incomplete tasks + exhaustion signal, injects resume
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
# Shared helpers
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/forge-helpers.sh
source "$SCRIPT_DIR/lib/forge-helpers.sh"

# ---------------------------------------------------------------------------
# Script-local helpers
# ---------------------------------------------------------------------------

# Count P0+P1 issues in the most recent review file
count_blocking_issues() {
  local review_dir="$FORGE_DIR/reviews"
  local latest
  latest=$(find_latest "$review_dir" '*.md')
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

# Remove a YAML frontmatter field from a file. Returns 0 on success.
remove_field() {
  local file="$1"
  local field="$2"
  local backup="${file}.bak"
  if ! sed -i.bak "/^${field}:/d" "$file" 2>/dev/null; then
    rm -f "$backup" 2>/dev/null
    return 1
  fi
  rm -f "$backup" 2>/dev/null
  return 0
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

# Case 3: Build phase incomplete — inject resume command
if [ "$current_phase" = "build" ]; then
  progress_count=$(find "$FORGE_DIR/progress" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$progress_count" -gt 0 ]; then
    pending=$(find "$FORGE_DIR/progress" -maxdepth 1 -name '*.md' -exec grep -c '\- \[ \]' {} + 2>/dev/null | awk '{s+=$1}END{print s}' || echo 0)
    pending=${pending:-0}
    if [ "$pending" -gt 0 ]; then
      exhaustion_flag=$(read_field "$STATUS_FILE" "exhaustion_pending")

      if [ "$exhaustion_flag" = "true" ]; then
        # Context exhaustion was detected — clear flag and inject resume
        if ! remove_field "$STATUS_FILE" "exhaustion_pending"; then
          echo "⚠️ 无法清除 exhaustion_pending 标记。请手动编辑 $STATUS_FILE。"
          exit 0
        fi

        echo "🔄 [BUILD 会话延续] 检测到上下文耗尽恢复点。"
        echo ""
        echo "请执行以下操作："
        echo "1. 读取 .forge/knowledge/sessions/ 中最新的 interim 文件"
        echo "2. 读取 .forge/progress/ 中的任务进度"
        echo "3. 从下一个未完成任务继续执行"
        echo ""
        echo "请立即运行 /forge resume 恢复上下文并继续构建。"
        echo "如需中止，运行 /forge abort。"
        exit 0
      fi

      # No exhaustion flag — check for recent interim file as fallback evidence
      # DoS guard: skip if multiple interim files exist in short window
      interim_count=$(find "$FORGE_DIR/knowledge/sessions" -maxdepth 1 -name '*-interim.md' -mmin "-${STALE_THRESHOLD_MINUTES}" 2>/dev/null | wc -l | tr -d ' ')
      if [ "${interim_count:-0}" -gt 3 ]; then
        exit 0
      fi

      latest_interim=$(find_latest "$FORGE_DIR/knowledge/sessions" '*-interim.md')

      if [ -n "$latest_interim" ] && is_fresh "$latest_interim" "$STALE_THRESHOLD_MINUTES"; then
        echo "🔄 [BUILD 会话延续] 检测到 interim 快照文件。"
        echo ""
        echo "请立即运行 /forge resume 恢复上下文并继续构建。"
        echo "如需中止，运行 /forge abort。"
        exit 0
      fi
    fi
  fi
fi

# Case 4: Stale exhaustion flag from a previous session — clean up
exhaustion_flag=$(read_field "$STATUS_FILE" "exhaustion_pending")
if [ "$exhaustion_flag" = "true" ]; then
  remove_field "$STATUS_FILE" "exhaustion_pending" 2>/dev/null || true
fi

exit 0
