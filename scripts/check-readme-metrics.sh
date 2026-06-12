#!/bin/bash
# category: internal-only
# ============================================================================
# check-readme-metrics.sh — README 指标校准检查
#
# 从源码和 vitest 输出中提取实际指标，与 README.md 中的声明进行比较。
# 本地（含 pre-push hook）：发现 drift 时自动重写 README 并通过，绝不阻断 push。
# CI（CI=true）：drift 视为失败，作为 PR 安全网（自动重写对 CI 临时检出无意义）。
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
readme_pbt_full=$(grep -oE '[0-9]+ (个为 fast-check|property-based)' README.md | head -1 || true)
readme_pbt_files=$(printf '%s' "${readme_pbt_full}" | grep -oE '^[0-9]+' || true)
pbt_suffix=$(printf '%s' "${readme_pbt_full}" | sed -E 's/^[0-9]+//' || true)
readme_tests=$(grep -oE '[0-9]+ 个测试（' README.md | head -1 | grep -oE '^[0-9]+' || true)

# Validate that all README claims were extracted
for var_name in readme_modules readme_test_files readme_pbt_files readme_tests; do
  if [[ -z "${!var_name}" ]]; then
    echo "ERROR: Could not extract ${var_name} from README.md"
    exit 1
  fi
done

# ---------- 6. Compare; auto-sync README locally, fail strictly in CI ----------
# Locally (incl. the pre-push hook) we rewrite drifted numbers in-place so a
# stale metric never blocks a push — commit README.md to persist the change. In
# CI (CI=true) the checkout is ephemeral, so auto-syncing is pointless and drift
# stays a hard failure to guard PRs.
echo "README Metrics Check"
echo "===================="

DRIFT=0
SYNC_FAIL=0

# sync_metric <label> <readme_val> <actual_val> <suffix>
# <suffix> is the literal substring immediately AFTER the number in README
# (e.g. " 个 TypeScript 模块"). Rewrites the first "<digits><suffix>" match.
sync_metric() {
  local label="$1" readme_val="$2" actual_val="$3" suffix="$4"

  if [[ "${readme_val}" -eq "${actual_val}" ]]; then
    printf "%-20s README %s, actual %s ✓\n" "${label}:" "${readme_val}" "${actual_val}"
    return
  fi

  DRIFT=$((DRIFT + 1))
  if [[ "${CI:-}" == "true" ]]; then
    printf "%-20s README %s, actual %s ✗\n" "${label}:" "${readme_val}" "${actual_val}"
    return
  fi

  # Slurp mode (-0) + single substitution (no /g) = first match only.
  perl -0 -i -pe "s/\\d+\\Q${suffix}\\E/${actual_val}${suffix}/" README.md
  local after
  after=$(grep -oE "[0-9]+${suffix}" README.md | head -1 | grep -oE '^[0-9]+' || true)
  if [[ "${after}" == "${actual_val}" ]]; then
    printf "%-20s README %s → %s (auto-synced)\n" "${label}:" "${readme_val}" "${actual_val}"
  else
    SYNC_FAIL=$((SYNC_FAIL + 1))
    printf "%-20s README %s, actual %s — auto-sync FAILED, update manually\n" "${label}:" "${readme_val}" "${actual_val}"
  fi
}

sync_metric "TypeScript modules" "${readme_modules}"    "${actual_modules}"    " 个 TypeScript 模块"
sync_metric "Test files"         "${readme_test_files}" "${actual_test_files}" " 个测试文件"
sync_metric "Property tests"     "${readme_pbt_files}"  "${actual_pbt_files}"  "${pbt_suffix}"
sync_metric "Total tests"        "${readme_tests}"      "${actual_tests}"      " 个测试（"

echo ""

if [[ "${DRIFT}" -gt 0 ]]; then
  if [[ "${CI:-}" == "true" ]]; then
    echo "FAIL: ${DRIFT} metric(s) out of date. Update README.md."
    exit 1
  fi
  if [[ "${SYNC_FAIL}" -gt 0 ]]; then
    echo "WARN: ${SYNC_FAIL} metric(s) could not be auto-synced — update README.md manually."
  fi
  echo "Auto-synced ${DRIFT} metric(s) in README.md (working tree). Commit to persist:"
  echo "  git add README.md && git commit"
  exit 0
fi

echo "All metrics match ✓"
exit 0
