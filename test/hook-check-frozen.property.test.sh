#!/usr/bin/env bash
# test/hook-check-frozen.property.test.sh — Property tests for classify_path robustness.
#
# Run: bash test/hook-check-frozen.property.test.sh
#
# Verifies that classify_path from scripts/zone-registry.sh never crashes and
# always returns a valid (<category> <reason_code>) pair when fed edge-case
# and adversarial path strings.
set -euo pipefail

PASS=0
FAIL=0
TOTAL=0

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "${script_dir}/.." && pwd)"

source "${project_dir}/scripts/zone-registry.sh"

cd "$project_dir"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Canonical list of valid categories and their associated reason codes.
# Build a lookup function so each test only needs the output string.
VALID_CATEGORIES="frozen-spec frozen-plan frozen-config frozen-custom guarded-append guarded-no-overwrite none"

assert_valid_output() {
  local desc="$1" actual="$2"
  TOTAL=$((TOTAL + 1))

  # Output must not be empty
  if [[ -z "$actual" ]]; then
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc — output is empty"
    return
  fi

  # Must contain exactly two space-separated tokens
  local category="" reason_code=""
  category="${actual%% *}"
  reason_code="${actual#* }"

  if [[ "$category" == "$actual" ]] || [[ -z "$reason_code" ]]; then
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc — expected '<category> <reason_code>', got [$actual]"
    return
  fi

  # Category must be in the whitelist
  local found=0
  local c
  for c in $VALID_CATEGORIES; do
    if [[ "$category" == "$c" ]]; then
      found=1
      break
    fi
  done

  if [[ $found -eq 0 ]]; then
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc — invalid category [$category] in output [$actual]"
    return
  fi

  PASS=$((PASS + 1))
}

assert_no_crash() {
  local desc="$1" actual="$2" exit_code="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$exit_code" -ne 0 ]]; then
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc — classify_path crashed (exit $exit_code), output [$actual]"
    return
  fi
  PASS=$((PASS + 1))
}

# Wrapper that calls classify_path and captures both output and exit code.
# Suppresses stderr to keep test output clean.
run_classify() {
  local input="$1"
  local _out="" _rc=0
  _out=$(classify_path "$input" 2>/dev/null) || _rc=$?
  echo "${_rc}"$'\t'"${_out}"
}

# ---------------------------------------------------------------------------
# 1. Empty string
# ---------------------------------------------------------------------------

echo "=== 1. Empty string ==="

unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "empty string no crash" "$out" "$rc"
assert_valid_output "empty string valid output" "$out"

# ---------------------------------------------------------------------------
# 2. Very long path (500+ chars)
# ---------------------------------------------------------------------------

echo "=== 2. Very long path ==="

# Generate a 600-char path by repeating a directory segment
LONG_SEGMENT="abcdefghij/"
LONG_PATH=""
i=0
while [[ $i -lt 60 ]]; do
  LONG_PATH="${LONG_PATH}${LONG_SEGMENT}"
  i=$((i + 1))
done
LONG_PATH="${LONG_PATH}.tinkerman/config.md"

unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "$LONG_PATH")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "long path (600+ chars) no crash" "$out" "$rc"
assert_valid_output "long path valid output" "$out"

# Long path without .forge
LONG_PATH_NO_FORGE=""
i=0
while [[ $i -lt 60 ]]; do
  LONG_PATH_NO_FORGE="${LONG_PATH_NO_FORGE}dir${i}/"
  i=$((i + 1))
done
LONG_PATH_NO_FORGE="${LONG_PATH_NO_FORGE}file.txt"

unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "$LONG_PATH_NO_FORGE")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "long path no .forge no crash" "$out" "$rc"
assert_valid_output "long path no .forge valid output" "$out"

# ---------------------------------------------------------------------------
# 3. Paths with special characters
# ---------------------------------------------------------------------------

echo "=== 3. Special characters ==="

# Spaces
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "path with spaces/.tinkerman/config.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "spaces in path no crash" "$out" "$rc"
assert_valid_output "spaces in path valid output" "$out"

# Unicode
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify ".tinkerman/specs/éèê/spec.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "unicode path no crash" "$out" "$rc"
assert_valid_output "unicode path valid output" "$out"

# Chinese characters
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify ".tinkerman/specs/规格/spec.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "CJK path no crash" "$out" "$rc"
assert_valid_output "CJK path valid output" "$out"

# Single quotes in path
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "it's/.tinkerman/config.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "single quotes path no crash" "$out" "$rc"
assert_valid_output "single quotes path valid output" "$out"

# Double quotes in path (embedded literal)
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify 'a"b/.tinkerman/config.md')
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "double quotes path no crash" "$out" "$rc"
assert_valid_output "double quotes path valid output" "$out"

# Backslashes (classify_path normalizes them)
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify 'deep\\nested\\.tinkerman\\config.md')
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "backslash path no crash" "$out" "$rc"
assert_valid_output "backslash path valid output" "$out"

# Newline embedded in path segment (unlikely but should not crash)
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
NL=$'\n'
result=$(run_classify "before${NL}after/.tinkerman/config.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "newline in path no crash" "$out" "$rc"
assert_valid_output "newline in path valid output" "$out"

# Tab character in path
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
TAB=$'\t'
result=$(run_classify "before${TAB}after/.tinkerman/config.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "tab in path no crash" "$out" "$rc"
assert_valid_output "tab in path valid output" "$out"

# Dollar sign and variable-like patterns
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify '$HOME/.tinkerman/config.md')
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "dollar sign path no crash" "$out" "$rc"
assert_valid_output "dollar sign path valid output" "$out"

# Semicolons (command injection attempt)
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify '.tinkerman/config.md;echo pwned')
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "semicolon path no crash" "$out" "$rc"
assert_valid_output "semicolon path valid output" "$out"

# Pipe character
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify '.tinkerman/config.md|cat')
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "pipe path no crash" "$out" "$rc"
assert_valid_output "pipe path valid output" "$out"

# ---------------------------------------------------------------------------
# 4. Path with multiple .tinkerman/ segments
# ---------------------------------------------------------------------------

echo "=== 4. Multiple .tinkerman/ segments ==="

unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "foo/.tinkerman/bar/.tinkerman/config.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "nested .forge segments no crash" "$out" "$rc"
assert_valid_output "nested .forge segments valid output" "$out"

# .forge inside .forge
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify ".tinkerman/.tinkerman/config.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash ".forge inside .forge no crash" "$out" "$rc"
assert_valid_output ".forge inside .forge valid output" "$out"

# Three levels
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "a/.tinkerman/b/.tinkerman/c/.tinkerman/specs/test/spec.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "triple .forge no crash" "$out" "$rc"
assert_valid_output "triple .forge valid output" "$out"

# ---------------------------------------------------------------------------
# 5. Path traversal patterns
# ---------------------------------------------------------------------------

echo "=== 5. Path traversal ==="

unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify ".tinkerman/../.tinkerman/config.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "dotdot .forge no crash" "$out" "$rc"
assert_valid_output "dotdot .forge valid output" "$out"

# Classic traversal
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "../../../etc/passwd")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "path traversal etc no crash" "$out" "$rc"
assert_valid_output "path traversal etc valid output" "$out"

# Traversal into .forge
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "../project/.tinkerman/config.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "traversal into .forge no crash" "$out" "$rc"
assert_valid_output "traversal into .forge valid output" "$out"

# Mixed traversal
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify ".tinkerman/specs/../../.tinkerman/plans/x.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "mixed traversal no crash" "$out" "$rc"
assert_valid_output "mixed traversal valid output" "$out"

# ---------------------------------------------------------------------------
# 6. Paths with null-like bytes
# ---------------------------------------------------------------------------

echo "=== 6. Null-byte-like handling ==="

# Bash cannot hold null bytes in variables, so test with literal NUL string
# representation and the string "\\0" which some tools produce.
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify $'.tinkerman/config\\0.md')
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "escaped null in path no crash" "$out" "$rc"
assert_valid_output "escaped null in path valid output" "$out"

# Literal \\x00 as text
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify '.tinkerman/config\x00.md')
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "hex null string no crash" "$out" "$rc"
assert_valid_output "hex null string valid output" "$out"

# Empty-looking but non-zero (just whitespace)
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "   ")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "whitespace-only path no crash" "$out" "$rc"
assert_valid_output "whitespace-only path valid output" "$out"

# ---------------------------------------------------------------------------
# 7. Absolute paths
# ---------------------------------------------------------------------------

echo "=== 7. Absolute paths ==="

unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "/tmp/project/.tinkerman/config.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "absolute path config.md no crash" "$out" "$rc"
assert_valid_output "absolute path config.md valid output" "$out"

unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "/Users/dev/project/.tinkerman/plans/my-plan.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "absolute path plan no crash" "$out" "$rc"
assert_valid_output "absolute path plan valid output" "$out"

unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "/etc/hosts")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "absolute path non-forge no crash" "$out" "$rc"
assert_valid_output "absolute path non-forge valid output" "$out"

# Root path
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "/")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "root path no crash" "$out" "$rc"
assert_valid_output "root path valid output" "$out"

# Just / with .forge suffix
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "/.tinkerman/config.md")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "root .forge no crash" "$out" "$rc"
assert_valid_output "root .forge valid output" "$out"

# ---------------------------------------------------------------------------
# 8. Random alphanumeric strings
# ---------------------------------------------------------------------------

echo "=== 8. Random alphanumeric strings ==="

# Simple alphanumeric (no path structure)
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "abc123XYZ")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "bare alphanumeric no crash" "$out" "$rc"
assert_valid_output "bare alphanumeric valid output" "$out"

# All digits
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "9999999999")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "all digits no crash" "$out" "$rc"
assert_valid_output "all digits valid output" "$out"

# Single character
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "a")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "single char no crash" "$out" "$rc"
assert_valid_output "single char valid output" "$out"

# Underscore and hyphen heavy
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "my-feature_branch.v2")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "underscore hyphen no crash" "$out" "$rc"
assert_valid_output "underscore hyphen valid output" "$out"

# Dots everywhere
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "....txt")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "dots-only filename no crash" "$out" "$rc"
assert_valid_output "dots-only filename valid output" "$out"

# UUID-like string
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "550e8400-e29b-41d4-a716-446655440000")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "UUID no crash" "$out" "$rc"
assert_valid_output "UUID valid output" "$out"

# Hash-like string
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "hash string no crash" "$out" "$rc"
assert_valid_output "hash string valid output" "$out"

# Repeated random-ish segments
unset ZONE_REGISTRY_CACHE 2>/dev/null || true
result=$(run_classify "a1/b2/c3/d4/e5/f6/g7/h8")
rc="${result%%$'\t'*}"
out="${result#*$'\t'}"
assert_no_crash "alphanumeric dirs no crash" "$out" "$rc"
assert_valid_output "alphanumeric dirs valid output" "$out"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "========================================="
echo "Property tests: ${PASS}/${TOTAL} passed, ${FAIL} failed"
echo "========================================="

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
