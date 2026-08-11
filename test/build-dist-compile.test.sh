#!/usr/bin/env bash
# T-BUILD-DIST-COMPILE — build-dist.sh conditional tsc compilation
# category: user-facing
#
# Verifies build-dist.sh ensures dist/src is freshly compiled before copying,
# so callers that don't pre-run tsc (pre-push hook, smoke-install, README
# install flow, bump-version --commit) still get a complete bundle.
#
#   C1: dist/src absent → build-dist compiles, bundle contains compiled JS
#   C2: dist/src fresh (no src newer than dist) → build-dist skips tsc
#       (verifies the "跳过编译" log line; CI zero-overhead path)
#   C3: dist/src stale (a src/*.ts newer than dist) → build-dist recompiles,
#       bundle contains the updated compiled output
#
# Runs against a temp git worktree copy so the real repo dist/ is untouched.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

pass=0
fail=0
assert() { if eval "$1"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $2"; fi; }

echo "── T-BUILD-DIST-COMPILE: build-dist conditional tsc ──"

# Build a throwaway copy of the repo (enough for tsc + build-dist): src/,
# scripts/, templates/, skills/, agents/, commands/, hooks/, package.json,
# tsconfig.json, .claude-plugin/, dist-manifest.json. Avoids polluting the
# real working tree and keeps the test fast.
# IMPORTANT: build-dist.sh derives FORGE_ROOT from ${BASH_SOURCE[0]}/.., so it
# MUST be invoked from the copy ($TMP/scripts/build-dist.sh), not the real
# path — otherwise FORGE_ROOT anchors to the real repo and the test sees the
# real dist/ instead of the temp one.
mk_repo_copy() {
  local dest
  dest=$(mktemp -d)
  local src_root="${SCRIPT_DIR}"
  # Source tree (for tsc) + config
  cp -R "${src_root}/src" "${dest}/src"
  cp "${src_root}/package.json" "${dest}/package.json"
  cp "${src_root}/tsconfig.json" "${dest}/tsconfig.json"
  # build-dist inputs
  cp -R "${src_root}/scripts" "${dest}/scripts"
  cp -R "${src_root}/templates" "${dest}/templates"
  cp -R "${src_root}/skills" "${dest}/skills"
  cp -R "${src_root}/agents" "${dest}/agents"
  cp -R "${src_root}/commands" "${dest}/commands"
  cp -R "${src_root}/hooks" "${dest}/hooks"
  cp -R "${src_root}/.claude-plugin" "${dest}/.claude-plugin"
  cp "${src_root}/.mcp.json" "${dest}/.mcp.json" 2>/dev/null || true
  cp "${src_root}/README.md" "${dest}/README.md" 2>/dev/null || true
  # node_modules: link so tsc resolves deps without a fresh install
  ln -s "${src_root}/node_modules" "${dest}/node_modules"
  echo "$dest"
}

# --- C1: dist/src absent → build-dist compiles ---
TMP=$(mk_repo_copy)
cd "$TMP"
output=$(bash "$TMP/scripts/build-dist.sh" 2>&1) || { echo "C1 build-dist failed:"; echo "$output"; fail=$((fail+1)); }
assert '[[ -d "$TMP/dist/src" ]]' "C1: dist/src created by build-dist"
assert '[[ -f "$TMP/dist/src/check-frozen.js" ]]' "C1: compiled check-frozen.js present"
assert 'echo "$output" | grep -q "正在编译"' "C1: build logged compilation (not skipped)"
# Bundle should carry the compiled JS (proves it wasn't a stale copy)
assert '[[ -f "$TMP/dist/claude-code/bundles/tinkerman/dist/src/check-frozen.js" ]]' \
  "C1: bundle includes compiled check-frozen.js"
rm -rf "$TMP"

# --- C2: dist/src fresh → build-dist skips tsc ---
TMP=$(mk_repo_copy)
cd "$TMP"
# Pre-compile so dist/src exists and is newer than every src file
npx tsc >/dev/null 2>&1 || true
# Ensure dist is strictly newer than src (sleep then touch a dist file)
sleep 1
find dist/src -name '*.js' -exec touch {} + 2>/dev/null || true
output=$(bash "$TMP/scripts/build-dist.sh" 2>&1) || { echo "C2 build-dist failed:"; echo "$output"; fail=$((fail+1)); }
assert 'echo "$output" | grep -q "跳过编译"' "C2: build logged skip (dist fresh)"
rm -rf "$TMP"

# --- C3: dist/src stale (src newer) → build-dist recompiles ---
TMP=$(mk_repo_copy)
cd "$TMP"
npx tsc >/dev/null 2>&1 || true
# Make a src file newer than the compiled output → stale
sleep 1
touch src/runtime-config-sync.ts
output=$(bash "$TMP/scripts/build-dist.sh" 2>&1) || { echo "C3 build-dist failed:"; echo "$output"; fail=$((fail+1)); }
assert 'echo "$output" | grep -q "正在重新编译\|正在编译"' "C3: build logged recompile (dist stale)"
# After rebuild, dist/src must reflect the (touched) src — recompiled fresh
assert '[[ dist/src/runtime-config-sync.js -nt src/runtime-config-sync.ts ]]' \
  "C3: dist/src newer than touched src after recompile"
rm -rf "$TMP"

echo ""
echo "── T-BUILD-DIST-COMPILE result: $pass passed, $fail failed ──"
[ $fail -eq 0 ]
