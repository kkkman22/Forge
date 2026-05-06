#!/bin/bash
# ============================================================================
# validate-skill-length.sh — SKILL.md 行数预算校验（Progressive Disclosure）
#
# 薄包装：调用 node 执行 validate-skill-length.mjs。
# 任何非豁免 skill 主文件超过 150 有效行则退出码非零。
#
# 用法：
#   bash scripts/validate-skill-length.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/validate-skill-length.mjs"
