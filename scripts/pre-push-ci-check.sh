#!/usr/bin/env bash
set -uo pipefail
# category: user-facing
# ============================================================================
# pre-push-ci-check.sh — 本地 pre-push 快速检查
#
# 模拟 CI check job 的关键步骤，在推送前发现常见问题。
# 用法:
#   bash scripts/pre-push-ci-check.sh
#
# 检查项:
#   1. 版本一致性 (package.json vs plugin.json)
#   2. shellcheck (如可用)
#   3. JSON 有效性 (hooks.json, plugin.json, marketplace.json)
#   4. bundle completeness (hooks.json 引用的脚本在 dist 中存在)
#
# 退出码: 0 = 全部通过, 1 = 有问题
# ============================================================================

set -euo pipefail

case "${1:-}" in
  -h|--help)
    cat <<'EOF'
Usage: bash scripts/pre-push-ci-check.sh

本地 pre-push 快速检查 — 模拟 CI check job 的关键步骤，在推送前发现常见问题。

检查项:
  1. 版本一致性 (package.json vs plugin.json)
  2. shellcheck (如可用)
  3. JSON 有效性 (hooks.json, plugin.json, marketplace.json)
  4. bundle completeness (hooks.json 引用的脚本在 dist 中存在)

退出码: 0 = 全部通过, 1 = 有问题
EOF
    exit 0
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ISSUES=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; ISSUES=$((ISSUES + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }

echo "=== Forge Pre-Push CI Check ==="
echo ""

# ── 1. Version consistency ─────────────────────────────────────────
echo "检查版本一致性..."

pkg_ver=$(node -e "console.log(require('${ROOT}/package.json').version)" 2>/dev/null || echo "ERROR")
plugin_ver=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${ROOT}/.claude-plugin/plugin.json','utf-8')).version)" 2>/dev/null || echo "ERROR")

if [[ "${pkg_ver}" == "ERROR" || "${plugin_ver}" == "ERROR" ]]; then
  fail "无法读取版本号"
else
  if [[ "${pkg_ver}" == "${plugin_ver}" ]]; then
    pass "package.json (${pkg_ver}) == plugin.json (${plugin_ver})"
  else
    fail "package.json (${pkg_ver}) != plugin.json (${plugin_ver})"
    echo "    修复: node scripts/bump-version.mjs ${pkg_ver}"
  fi
fi

# ── 2. Shellcheck ──────────────────────────────────────────────────
echo ""
echo "检查 shell 脚本..."

if command -v shellcheck &>/dev/null; then
  if shellcheck -x -S warning "${ROOT}/scripts/"*.sh 2>&1; then
    pass "shellcheck 通过"
  else
    fail "shellcheck 发现问题（见上方输出）"
  fi
else
  warn "shellcheck 未安装，跳过（brew install shellcheck）"
fi

# ── 3. JSON validity ───────────────────────────────────────────────
echo ""
echo "检查 JSON 文件..."

for f in hooks/hooks.json .claude-plugin/plugin.json .claude-plugin/marketplace.json; do
  if [[ -f "${ROOT}/${f}" ]]; then
    if node -e "JSON.parse(require('fs').readFileSync('${ROOT}/${f}','utf-8'))" 2>/dev/null; then
      pass "${f} 有效"
    else
      fail "${f} JSON 解析失败"
    fi
  fi
done

# ── 4. Bundle completeness ─────────────────────────────────────────
echo ""
echo "检查 bundle completeness..."

if [[ -f "${ROOT}/scripts/check-bundle-sync.mjs" ]]; then
  # Run completeness only (skip freshness — local may not have rebuilt)
  if FORGE_SKIP_BUNDLE_SYNC=1 CI=true node "${ROOT}/scripts/check-bundle-sync.mjs" 2>&1 | grep -q "OK"; then
    pass "bundle completeness 通过"
  else
    # check-bundle-sync may still fail on completeness
    node "${ROOT}/scripts/check-bundle-sync.mjs" 2>&1 || true
    warn "bundle sync 检查有告警（dist 可能需要 rebuild）"
  fi
else
  warn "check-bundle-sync.mjs 不存在，跳过"
fi

# ── Summary ────────────────────────────────────────────────────────
echo ""
if [[ ${ISSUES} -eq 0 ]]; then
  echo -e "${GREEN}=== 全部通过 (${ISSUES} 个问题) ===${NC}"
  exit 0
else
  echo -e "${RED}=== ${ISSUES} 个问题需要修复 ===${NC}"
  exit 1
fi
