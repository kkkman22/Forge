#!/bin/bash
# category: internal-only
# ============================================================================
# validate-skill-descriptions.sh — SKILL.md description "Use when" 规范校验
#
# 薄包装：调用 node 执行 validate-skill-descriptions.mjs。
# 任何 skill 违规则退出码非零。
#
# 用法：
#   bash scripts/validate-skill-descriptions.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/validate-skill-descriptions.mjs"
