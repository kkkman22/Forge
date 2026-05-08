#!/bin/bash
# category: internal-only
# ============================================================================
# check-evolution-marker-zones.sh — Evolution 标记位置校验
#
# 薄包装：调用 node 执行 check-evolution-marker-zones.mjs。
# 任何冻结区 / 锁定文件中出现 Evolution 标记则退出码非零。
#
# 用法：
#   bash scripts/check-evolution-marker-zones.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/check-evolution-marker-zones.mjs"
