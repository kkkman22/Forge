#!/bin/bash
# category: internal-only
# ============================================================================
# check-readme-metrics.sh — README 指标校准检查
#
# 从源码和 vitest 输出中提取实际指标，与 README.md 中的声明进行比较。
# 如果任何指标不一致，以非零状态退出并报告差异。
#
# 用法：
#   bash scripts/check-readme-metrics.sh
# ============================================================================

set -euo pipefail

DRIFT=0

# ---------- 1. Count TypeScript modules in src/ ----------
actual_modules=$(find src -name '*.ts' | wc -l | tr -d ' ')

# ---------- 2. Count test files in test/ ----------
actual_test_files=$(find test -name '*.test.ts' | wc -l | tr -d ' ')

# ---------- 3. Count property test files in test/ ----------
actual_pbt_files=$(find test -name '*.property.test.ts' | wc -l | tr -d ' ')

# ---------- 4. Count tests via `vitest list` (collect-only, no execution) ----------
# IMPORTANT: do NOT use `vitest run` here. The full `npm run check` already runs
# the suite once (step 3); re-running it here (a) doubles push latency and
# (b) has deadlocked on the tool-health-writer concurrency test when invoked a
# second time in the same check. `vitest list` enumerates tests without executing
# them, so it cannot hang and is fast. It counts collected test definitions
# (it.each / parameterized rows are NOT expanded), so the README total is
# calibrated to this collection count, not to vitest's numTotalTests.
actual_tests=$(npx vitest list 2>/dev/null | grep -c .) || actual_tests=""

if [[ -z "${actual_tests}" ]] || ! [[ "${actual_tests}" =~ ^[0-9]+$ ]]; then
  echo "ERROR: Could not extract total test count from vitest JSON output."
  echo "Raw output: ${actual_tests}"
  exit 1
fi

# ---------- 5. Extract README claims ----------
readme_modules=$(grep -oE '[0-9]+ 个 TypeScript 模块' README.md | head -1 | grep -oE '^[0-9]+' || true)
readme_test_files=$(grep -oE '[0-9]+ 个测试文件' README.md | head -1 | grep -oE '^[0-9]+' || true)
readme_pbt_files=$(grep -oE '[0-9]+ (个为 fast-check|property-based)' README.md | head -1 | grep -oE '^[0-9]+' || true)
readme_tests=$(grep -oE '[0-9]+ 个测试（' README.md | head -1 | grep -oE '^[0-9]+' || true)

# Validate that all README claims were extracted
for var_name in readme_modules readme_test_files readme_pbt_files readme_tests; do
  if [[ -z "${!var_name}" ]]; then
    echo "ERROR: Could not extract ${var_name} from README.md"
    exit 1
  fi
done

# ---------- 6. Compare and report ----------
echo "README Metrics Check"
echo "===================="

compare() {
  local label="$1"
  local readme_val="$2"
  local actual_val="$3"

  if [[ "${readme_val}" -eq "${actual_val}" ]]; then
    printf "%-20s README says %s, actual %s ✓\n" "${label}:" "${readme_val}" "${actual_val}"
  else
    printf "%-20s README says %s, actual %s ✗\n" "${label}:" "${readme_val}" "${actual_val}"
    DRIFT=$((DRIFT + 1))
  fi
}

compare "TypeScript modules" "${readme_modules}" "${actual_modules}"
compare "Test files" "${readme_test_files}" "${actual_test_files}"
compare "Property tests" "${readme_pbt_files}" "${actual_pbt_files}"
compare "Total tests" "${readme_tests}" "${actual_tests}"

echo ""

if [[ "${DRIFT}" -gt 0 ]]; then
  echo "FAIL: ${DRIFT} metric(s) out of date. Update README.md."
  exit 1
else
  echo "All metrics match ✓"
  exit 0
fi
