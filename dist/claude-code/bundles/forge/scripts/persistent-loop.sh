#!/usr/bin/env bash
# category: internal-only
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

# Get file mtime as epoch seconds (macOS + Linux compatible)
stat_mtime() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "0"
    return
  fi
  stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null || echo "0"
}

# Compute phase state hash for dedupe (9 fields + sha1)
compute_phase_state_hash() {
  local phase="$1" tier="$2" topic="$3" total="$4" done_count="$5"
  local review_mtime test_mtime mode loop_iter
  local review_dir="$FORGE_DIR/reviews"
  local latest_review
  latest_review=$(find_latest "$review_dir" '*.md')
  review_mtime=$(stat_mtime "$latest_review")
  local test_dir="$FORGE_DIR/test-results"
  local latest_test
  latest_test=$(find_latest "$test_dir" '*.md')
  test_mtime=$(stat_mtime "$latest_test")
  mode=$(read_field "$STATUS_FILE" "mode")
  loop_iter=$(read_field "$STATUS_FILE" "loop_iteration")
  echo "${phase}|${tier}|${topic}|${total}|${done_count}|${review_mtime}|${test_mtime}|${mode}|${loop_iter}" \
    | shasum -a 1 | awk '{print $1}'
}

# Check and mark dedupe (returns 0 = proceed, 1 = skip)
check_and_mark_dedupe() {
  local hash="$1"
  local marker="$FORGE_DIR/.stop-hook-dedupe/${hash}.ts"
  mkdir -p "$FORGE_DIR/.stop-hook-dedupe" 2>/dev/null || return 0
  if [ -f "$marker" ]; then
    local age
    age=$(( $(date +%s) - $(stat_mtime "$marker") ))
    [ "$age" -lt 60 ] && return 1
  fi
  touch "$marker"
  return 0
}

# Cleanup stale dedupe markers (>24h)
cleanup_dedupe_stale() {
  find "$FORGE_DIR/.stop-hook-dedupe" -mtime +1 -delete 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Script-local helpers (existing)
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

# Cleanup stale dedupe markers before evaluating cases
cleanup_dedupe_stale

# Read current topic for dedupe hash
current_topic=$(read_field "$STATUS_FILE" "current_task")

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
    pending=$(find "$FORGE_DIR/progress" -maxdepth 1 -name '*.md' -exec grep -c '\- \[ \]' {} + 2>/dev/null | awk '{s+=$1}END{print s}' || true)
    pending=$(echo "$pending" | head -1)
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

# ---------------------------------------------------------------------------
# Phase Transition Cases (Requirement 3.2–3.6, 5.2, 5.3)
# ---------------------------------------------------------------------------

# Case 10: Loop iteration handoff — mode=autonomous priority check (Requirement 5.2, 5.3)
# Evaluates BEFORE Cases 5-9 to prevent duplicate injection in loop mode
current_mode=$(read_field "$STATUS_FILE" "mode")
if [ "$current_mode" = "autonomous" ]; then
  progress_count=$(find "$FORGE_DIR/progress" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
  if [ "${progress_count:-0}" -gt 0 ]; then
    pending=$(find "$FORGE_DIR/progress" -maxdepth 1 -name '*.md' -exec grep -c '\- \[ \]' {} + 2>/dev/null | awk '{s+=$1}END{print s}' | tail -1 || echo 0)
    pending=${pending:-0}
    if [ "$pending" -gt 0 ]; then
      hash=$(compute_phase_state_hash "$current_phase" "$current_tier" "$current_topic" "0" "$pending")
      if check_and_mark_dedupe "$hash"; then
        echo "🔄 [LOOP HANDOFF] 当前 phase 已 ship，但 progress 中仍有未完成任务（进入下一 Sprint）。"
        echo "请立即调用 Skill(skill=\"forge\", args=\"resume\") 恢复上下文并推进下一轮迭代。"
      fi
      exit 0
    fi
  fi
  # Also check skill_sequence remaining
  skill_sequence=$(read_field "$STATUS_FILE" "skill_sequence")
  loop_iteration=$(read_field "$STATUS_FILE" "loop_iteration")
  if [ -n "$skill_sequence" ] && [ -n "$loop_iteration" ]; then
    total_phases=$(echo "$skill_sequence" | tr ',' '\n' | wc -l | tr -d ' ')
    if [ "${loop_iteration:-0}" -lt "$total_phases" ]; then
      hash=$(compute_phase_state_hash "$current_phase" "$current_tier" "$current_topic" "$total_phases" "$loop_iteration")
      if check_and_mark_dedupe "$hash"; then
        echo "🔄 [LOOP HANDOFF] 当前 phase 已 ship，但 progress 中仍有未完成任务（进入下一 Sprint）。"
        echo "请立即调用 Skill(skill=\"forge\", args=\"resume\") 恢复上下文并推进下一轮迭代。"
      fi
      exit 0
    fi
  fi
fi

# Case 5: plan → build (Requirement 3.2)
# Trigger: phase=plan + plan approved + tier≠light + progress empty
if [ "$current_phase" = "plan" ]; then
  latest_plan=$(find_latest "$FORGE_DIR/plans" '*.md')
  if [ -n "$latest_plan" ]; then
    plan_status=$(read_field "$latest_plan" "status")
    if [ "$plan_status" = "approved" ]; then
      progress_file="$FORGE_DIR/progress/${current_topic}.md"
      if [ ! -f "$progress_file" ] || [ ! -s "$progress_file" ]; then
        hash=$(compute_phase_state_hash "$current_phase" "$current_tier" "$current_topic" "0" "0")
        if check_and_mark_dedupe "$hash"; then
          echo "🔄 [AUTO-ADVANCE] Plan 已批准，build 阶段未启动。"
          echo "请立即调用 Skill(skill=\"forge\", args=\"build\") 进入构建阶段。"
        fi
        exit 0
      fi
    fi
  fi
fi

# Case 6: build → review (Requirement 3.3)
# Trigger: phase=build + progress all [x] + review missing or stale
if [ "$current_phase" = "build" ]; then
  progress_file="$FORGE_DIR/progress/${current_topic}.md"
  if [ -f "$progress_file" ] && [ -s "$progress_file" ]; then
    pending=$(grep -c '\- \[ \]' "$progress_file" 2>/dev/null || true)
    pending=$(echo "$pending" | head -1)
    pending=${pending:-0}
    if [ "$pending" -eq 0 ]; then
      latest_review=$(find_latest "$FORGE_DIR/reviews" '*.md')
      progress_mtime=$(stat_mtime "$progress_file")
      review_mtime=$(stat_mtime "$latest_review")
      if [ -z "$latest_review" ] || [ "$review_mtime" -lt "$progress_mtime" ]; then
        hash=$(compute_phase_state_hash "$current_phase" "$current_tier" "$current_topic" "0" "0")
        if check_and_mark_dedupe "$hash"; then
          echo "🔄 [AUTO-ADVANCE] Build 阶段所有任务已完成，review 未执行或已过期。"
          echo "请立即调用 Skill(skill=\"forge\", args=\"review\") 进入评审阶段。"
        fi
        exit 0
      fi
    fi
  fi
fi

# Case 7: review → test (Requirement 3.4)
# Trigger: phase=review + review pass (P0=0, P1=0) + tier∈(standard,full) + test missing
if [ "$current_phase" = "review" ]; then
  latest_review=$(find_latest "$FORGE_DIR/reviews" '*.md')
  if [ -n "$latest_review" ]; then
    review_result=$(read_field "$latest_review" "result")
    p0_count=$(read_field "$latest_review" "p0_count")
    p1_count=$(read_field "$latest_review" "p1_count")
    p0_count=${p0_count:-0}
    p1_count=${p1_count:-0}
    if [ "$review_result" = "pass" ] && [ "$p0_count" -eq 0 ] && [ "$p1_count" -eq 0 ]; then
      if [ "$current_tier" = "standard" ] || [ "$current_tier" = "full" ]; then
        latest_test=$(find_latest "$FORGE_DIR/test-results" '*.md')
        if [ -z "$latest_test" ]; then
          hash=$(compute_phase_state_hash "$current_phase" "$current_tier" "$current_topic" "0" "0")
          if check_and_mark_dedupe "$hash"; then
            echo "🔄 [AUTO-ADVANCE] Review 已通过（P0=0, P1=0），test 阶段未执行。"
            echo "请立即调用 Skill(skill=\"forge\", args=\"test\") 进入测试阶段。"
          fi
          exit 0
        fi
      fi
    fi
  fi
fi

# Case 8: test → ship (Requirement 3.5)
# Trigger: phase=test + test pass + ship artifact missing
if [ "$current_phase" = "test" ]; then
  latest_test=$(find_latest "$FORGE_DIR/test-results" '*.md')
  if [ -n "$latest_test" ]; then
    test_result=$(read_field "$latest_test" "result")
    if [ "$test_result" = "pass" ]; then
      ship_file="$FORGE_DIR/ship/${current_topic}.md"
      if [ ! -f "$ship_file" ]; then
        hash=$(compute_phase_state_hash "$current_phase" "$current_tier" "$current_topic" "0" "0")
        if check_and_mark_dedupe "$hash"; then
          echo "🔄 [AUTO-ADVANCE] Test 阶段全部通过，ship 阶段未执行。"
          echo "请立即调用 Skill(skill=\"forge\", args=\"ship\") 进入交付阶段。"
        fi
        exit 0
      fi
    fi
  fi
fi

# Case 9: ship → learn (Requirement 3.6)
# Trigger: phase=ship + tier=full + ship artifact exists + learn missing
if [ "$current_phase" = "ship" ] && [ "$current_tier" = "full" ]; then
  ship_file="$FORGE_DIR/ship/${current_topic}.md"
  if [ -f "$ship_file" ]; then
    learn_file="$FORGE_DIR/knowledge/sessions/${current_topic}-learned.md"
    if [ ! -f "$learn_file" ]; then
      hash=$(compute_phase_state_hash "$current_phase" "$current_tier" "$current_topic" "0" "0")
      if check_and_mark_dedupe "$hash"; then
        echo "🔄 [AUTO-ADVANCE] Ship 已完成（tier=full），learn 阶段未执行。"
        echo "请立即调用 Skill(skill=\"forge\", args=\"learn\") 沉淀本次开发经验。"
      fi
      exit 0
    fi
  fi
fi

exit 0
