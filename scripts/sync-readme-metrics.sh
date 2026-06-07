#!/bin/bash
# category: internal-only
# ============================================================================
# sync-readme-metrics.sh — 从源码提取实际指标，同步写入 README.md
#
# 与 check-readme-metrics.sh 对应：check 只检查，sync 执行修复。
# CI 的 sync-derived-data workflow 在 push to main 后自动调用此脚本。
#
# 用法：
#   bash scripts/sync-readme-metrics.sh
# ============================================================================

set -euo pipefail

# ---------- 1. Count TypeScript modules in src/ ----------
actual_modules=$(find src -name '*.ts' | wc -l | tr -d ' ')

# ---------- 2. Count test files in test/ ----------
actual_test_files=$(find test -name '*.test.ts' | wc -l | tr -d ' ')

# ---------- 3. Count property test files in test/ ----------
actual_pbt_files=$(find test -name '*.property.test.ts' | wc -l | tr -d ' ')

# ---------- 4. Extract total test count from vitest JSON output ----------
# Use --outputFile to avoid stdout pollution from other reporters / hooks.
VITEST_OUTPUT=$(mktemp)
export VITEST_OUTPUT
npx vitest run --reporter=json --outputFile="${VITEST_OUTPUT}" >/dev/null 2>&1 || true

actual_tests=$(node -e "
  const fs = require('fs');
  try {
    const raw = fs.readFileSync(process.env.VITEST_OUTPUT, 'utf-8');
    const j = JSON.parse(raw);
    console.log(j.numTotalTests);
  } catch(e) {
    console.error('Failed to parse vitest JSON output:', e.message);
    process.exit(1);
  }
" 2>&1) || true

rm -f "${VITEST_OUTPUT}"
unset VITEST_OUTPUT

if [[ -z "${actual_tests}" ]] || ! [[ "${actual_tests}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: Could not extract total test count from vitest JSON output."
  echo "Raw output: ${actual_tests}"
  exit 1
fi

# ---------- 5. Compare with current README values ----------
readme_tests=$(grep -oE '[0-9]+ 个测试（' README.md | head -1 | grep -oE '^[0-9]+' || true)

echo "Syncing README metrics:"
echo "  modules=${actual_modules}  test_files=${actual_test_files}  pbt_files=${actual_pbt_files}  total_tests=${actual_tests}"

# Guard: if vitest reports fewer tests than README already claims, the CI environment
# may be missing some test suites (e.g. platform-specific or dist-dependent).
# Do NOT downgrade the count — let the local check-readme-metrics.sh gate catch it.
if [[ -n "${readme_tests}" ]] && [[ "${actual_tests}" -lt "${readme_tests}" ]]; then
  echo "WARNING: vitest reported ${actual_tests} tests, but README claims ${readme_tests}."
  echo "         CI environment may have skipped some suites. Skipping README sync to prevent downgrade."
  exit 0
fi

# macOS sed requires '' for in-place without backup; Linux sed doesn't need it.
# -E enables ERE so '+' works as a quantifier without escaping.
if [[ "$(uname)" == "Darwin" ]]; then
  SED_INPLACE=(sed -i '' -E)
else
  SED_INPLACE=(sed -i -E)
fi

"${SED_INPLACE[@]}" "s/[0-9]+ 个 TypeScript 模块/${actual_modules} 个 TypeScript 模块/" README.md
"${SED_INPLACE[@]}" "s/[0-9]+ 个测试（/${actual_tests} 个测试（/" README.md
"${SED_INPLACE[@]}" "s/[0-9]+ 个测试文件/${actual_test_files} 个测试文件/" README.md
"${SED_INPLACE[@]}" "s/[0-9]+ 个为 fast-check/${actual_pbt_files} 个为 fast-check/" README.md

echo "README.md synced ✓"
