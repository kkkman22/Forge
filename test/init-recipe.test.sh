#!/usr/bin/env bash
# T-06 (Wave 6) — Recipe system test (Req6).
# category: user-facing
#
# Verifies /forge init --recipe <name>:
#   AC1/AC2: --recipe copies templates/recipes/<name>/ into the user project.
#   AC9:     does NOT auto-run install (only prints the command).
#   AC10:    detects package manager (pnpm/npm/yarn) in the install hint.
#   AC12:    unknown recipe → non-zero exit + lists available recipes.
#   AC13:    existing file conflict → skipped + reported (manual merge hint).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)/scripts"
INIT_SH="${SCRIPT_DIR}/init.sh"
RECIPES_DIR="$(cd "$(dirname "$0")/.." && pwd)/templates/recipes"

# Each test runs init.sh --recipe in a throwaway temp project root.
mk_project() {
  local dir
  dir=$(mktemp -d)
  echo "$dir"
}

pass=0
fail=0
assert() { if eval "$1"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $2"; fi; }

echo "── T-06: Recipe system ──"

# --- AC1/AC2: vue3 recipe generates expected files into the project ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" --recipe vue3-vitest-msw --non-interactive 2>&1 || true)
assert '[[ -f "$TMP/vitest.config.ts" ]]' "vue3: vitest.config.ts generated"
assert '[[ -f "$TMP/msw/handlers.ts" ]]' "vue3: msw/handlers.ts generated"
assert '[[ -f "$TMP/test/component/data-driven.example.test.ts" ]]' "vue3: data-driven example generated (AC7)"
assert '[[ -f "$TMP/test/component/interaction.example.test.ts" ]]' "vue3: interaction example generated (AC6)"
assert '[[ -f "$TMP/README.md" ]]' "vue3: README generated"
assert '[[ -f "$TMP/package.devDeps.snippet" ]]' "vue3: devDeps snippet generated"
rm -rf "$TMP"

# --- AC1/AC2: react recipe generates expected files ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" --recipe react-vitest-msw --non-interactive 2>&1 || true)
assert '[[ -f "$TMP/vitest.config.ts" ]]' "react: vitest.config.ts generated"
assert '[[ -f "$TMP/msw/handlers.ts" ]]' "react: msw/handlers.ts generated"
assert '[[ -f "$TMP/test/component/data-driven.example.test.ts" ]]' "react: data-driven example generated"
rm -rf "$TMP"

# --- AC9: does NOT auto-run install (output mentions the command, never executes) ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" --recipe vue3-vitest-msw --non-interactive 2>&1 || true)
assert 'echo "$output" | grep -qiE "install|add -D"' "vue3: install hint printed (AC9)"
# no node_modules should have been created by the recipe
assert '! [[ -d "$TMP/node_modules" ]]' "vue3: no auto-install ran (AC9)"
rm -rf "$TMP"

# --- AC10: package manager detection — pnpm lockfile → pnpm hint ---
TMP=$(mk_project)
cd "$TMP"
touch pnpm-lock.yaml
output=$(bash "$INIT_SH" --recipe vue3-vitest-msw --non-interactive 2>&1 || true)
assert 'echo "$output" | grep -qi "pnpm"' "pkg manager: pnpm detected from lockfile (AC10)"
rm -rf "$TMP"

# --- AC10: npm fallback when no lockfile ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" --recipe vue3-vitest-msw --non-interactive 2>&1 || true)
assert 'echo "$output" | grep -qiE "npm|pnpm|yarn"' "pkg manager: some manager in hint (AC10)"
rm -rf "$TMP"

# --- AC12: unknown recipe → non-zero exit + lists available ---
TMP=$(mk_project)
cd "$TMP"
set +e
output=$(bash "$INIT_SH" --recipe nonexistent-recipe --non-interactive 2>&1)
exit_code=$?
set -e
assert '[ $exit_code -ne 0 ]' "unknown recipe: non-zero exit (AC12)"
assert 'echo "$output" | grep -qi "vue3-vitest-msw\|available"' "unknown recipe: lists available (AC12)"
rm -rf "$TMP"

# --- AC13: existing file conflict → skipped + reported (manual merge hint) ---
TMP=$(mk_project)
cd "$TMP"
mkdir -p "$TMP"
echo "existing config" > "$TMP/vitest.config.ts"
output=$(bash "$INIT_SH" --recipe vue3-vitest-msw --non-interactive 2>&1 || true)
# existing file must be preserved (not overwritten)
assert '[[ "$(cat "$TMP/vitest.config.ts")" == "existing config" ]]' "conflict: existing file not overwritten (AC13)"
# conflict reported with a merge hint
assert 'echo "$output" | grep -qiE "conflict|skip|merge|exists"' "conflict: reported with hint (AC13)"
rm -rf "$TMP"

echo ""
echo "── T-06 result: $pass passed, $fail failed ──"
[ $fail -eq 0 ]
