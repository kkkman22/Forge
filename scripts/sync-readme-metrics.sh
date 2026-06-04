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
actual_tests=$(npx vitest run --reporter=json 2>/dev/null | node -e "
  let data='';
  process.stdin.on('data', c => data += c);
  process.stdin.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log(j.numTotalTests);
    } catch(e) {
      console.error('Failed to parse vitest JSON output');
      process.exit(1);
    }
  });
" 2>&1) || true

if [[ -z "${actual_tests}" ]] || ! [[ "${actual_tests}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: Could not extract total test count from vitest JSON output."
  echo "Raw output: ${actual_tests}"
  exit 1
fi

# ---------- 5. Replace values in README.md ----------
echo "Syncing README metrics:"
echo "  modules=${actual_modules}  test_files=${actual_test_files}  pbt_files=${actual_pbt_files}  total_tests=${actual_tests}"

# macOS sed requires '' for in-place without backup; Linux sed doesn't need it.
if [[ "$(uname)" == "Darwin" ]]; then
  SED_INPLACE=(sed -i '')
else
  SED_INPLACE=(sed -i)
fi

"${SED_INPLACE[@]}" "s/[0-9]\+ 个 TypeScript 模块/${actual_modules} 个 TypeScript 模块/" README.md
"${SED_INPLACE[@]}" "s/[0-9]\+ 个测试（/${actual_tests} 个测试（/" README.md
"${SED_INPLACE[@]}" "s/[0-9]\+ 个测试文件/${actual_test_files} 个测试文件/" README.md
"${SED_INPLACE[@]}" "s/[0-9]\+ 个为 fast-check/${actual_pbt_files} 个为 fast-check/" README.md

echo "README.md synced ✓"
