#!/usr/bin/env bash
# ============================================================================
# hook-task-completed.sh — Agent Teams TaskCompleted gate.
#
# Triggered when a teammate marks a shared task as completed. Routes the
# task through Forge's existing review / test gates so that work done
# inside an Agent Teams session is held to the same standards as
# Subagent-mode work.
#
# Behaviour:
#   - exit 0  → allow task completion
#   - exit 2  → block task completion (Claude Code reports the stderr
#               text back to the lead and keeps the teammate working)
#   - exit 1  → unexpected error; log and allow (fail-open to avoid
#               blocking on bugs in the hook itself)
#
# Tier 0 hook (ROADMAP §v3.0 / ADR-0007). Does not depend on any of the
# 5 Agent Teams blocker issues being closed.
# ============================================================================

set -uo pipefail

PHASE_FILE=".forge/status.md"
if [[ -d ".forge/status" ]]; then
  PHASE_FILE=$(ls -t .forge/status/*.md 2>/dev/null | head -1)
fi

if [[ ! -f "${PHASE_FILE:-}" ]]; then
  exit 0
fi

PHASE=$(grep '^phase:' "${PHASE_FILE}" 2>/dev/null \
  | sed 's/phase: *"\{0,1\}//;s/"\{0,1\} *$//' \
  | tr -d '[:space:]')

case "${PHASE}" in
  review)
    # Verify a review report exists with a non-incomplete result before
    # letting the team mark the review task complete. This mirrors the
    # ship gate in src/ship.ts.
    REVIEW_FILE=$(ls -t .forge/reviews/*.md 2>/dev/null | head -1)
    if [[ -z "${REVIEW_FILE}" ]] || [[ ! -f "${REVIEW_FILE}" ]]; then
      echo "🚫 review 阶段任务被阻止：没有找到 .forge/reviews/*.md，请先生成评审报告" >&2
      exit 2
    fi
    RESULT=$(grep '^result:' "${REVIEW_FILE}" 2>/dev/null \
      | sed 's/result: *"\{0,1\}//;s/"\{0,1\} *$//' \
      | tr -d '[:space:]')
    if [[ "${RESULT}" == "incomplete" ]] || [[ -z "${RESULT}" ]]; then
      echo "🚫 review 任务被阻止：${REVIEW_FILE} 的 result 仍为 incomplete，请补全评审" >&2
      exit 2
    fi
    if [[ "${RESULT}" == "fail" ]]; then
      echo "🚫 review 任务被阻止：${REVIEW_FILE} 的 result=fail，存在 P0/P1 问题需要先修复" >&2
      exit 2
    fi
    ;;
  test)
    # Test phase: ensure a verification command was actually run (proxy:
    # progress file mentions a test command output). Light advisory only.
    PROGRESS_FILE=$(ls -t .forge/progress/*.md 2>/dev/null | head -1)
    if [[ -z "${PROGRESS_FILE}" ]] || [[ ! -f "${PROGRESS_FILE}" ]]; then
      exit 0
    fi
    if ! grep -qE '(npm run|vitest|pytest|cargo test|go test)' "${PROGRESS_FILE}" 2>/dev/null; then
      echo "⚠️ test 任务完成前请确认已运行验证命令并粘贴输出（progress 中未发现常见测试命令）" >&2
      # Soft-fail (still exit 2) so the lead and teammate get the message
      exit 2
    fi
    ;;
  ship)
    # Ship phase: refuse if review report is missing or incomplete.
    REVIEW_FILE=$(ls -t .forge/reviews/*.md 2>/dev/null | head -1)
    if [[ -z "${REVIEW_FILE}" ]] || [[ ! -f "${REVIEW_FILE}" ]]; then
      echo "🚫 ship 任务被阻止：没有评审报告。运行 /forge review 后再 ship" >&2
      exit 2
    fi
    RESULT=$(grep '^result:' "${REVIEW_FILE}" 2>/dev/null \
      | sed 's/result: *"\{0,1\}//;s/"\{0,1\} *$//' \
      | tr -d '[:space:]')
    if [[ "${RESULT}" != "pass" ]]; then
      echo "🚫 ship 任务被阻止：评审 result=${RESULT}，必须为 pass 才能 ship" >&2
      exit 2
    fi
    ;;
  *)
    # Other phases: no-op. Hook only enforces gates for review/test/ship.
    exit 0
    ;;
esac

echo "✅ Agent Teams 任务完成已通过 Forge ${PHASE} 门禁"
exit 0
