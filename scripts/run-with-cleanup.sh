#!/bin/bash
set -uo pipefail
# category: internal-only
# ============================================================================
# run-with-cleanup.sh — 运行命令，退出时自动清理孤儿 vitest/node 进程
#
# 用法：
#   bash scripts/run-with-cleanup.sh <command...>
#
# 示例：
#   bash scripts/run-with-cleanup.sh npx vitest run --coverage
#   bash scripts/run-with-cleanup.sh npm run check
#
# 原理：记录启动前的 vitest 进程 PID 列表，退出时 kill 新增的孤儿进程。
# ============================================================================

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: bash scripts/run-with-cleanup.sh <command...>"
  echo ""
  echo "Runs the given command and cleans up any orphan vitest/node"
  echo "processes on exit (normal, Ctrl+C, timeout)."
  exit 1
fi

# Snapshot PIDs of vitest processes before running
BEFORE_PIDS=$(pgrep -f "vitest" 2>/dev/null || true)

cleanup() {
  # Find vitest PIDs that weren't there before we started
  AFTER_PIDS=$(pgrep -f "vitest" 2>/dev/null || true)
  for pid in ${AFTER_PIDS}; do
    if ! echo "${BEFORE_PIDS}" | grep -qw "${pid}"; then
      kill "${pid}" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT

# Run the command
"$@"
