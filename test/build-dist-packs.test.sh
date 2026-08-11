#!/usr/bin/env bash
# T-BUILD-DIST-PACKS — build-dist.sh copies formal packs into the plugin bundle
# category: user-facing
#
# Verifies the packs-plugin-distribution (slice A') REQ-01/02/03 changes to
# scripts/build-dist.sh:
#
#   P1: build-dist copies packs/pms/ into BOTH CC bundle and plugin dist
#       (CC_BUNDLE/packs/pms/ + PLUGIN_DIST/packs/pms/), containing pack.yaml,
#       contexts/, state-machines/, utils/business-day-clock.ts.
#   P2: sample pack excluded — packs/pms-marriott-sample must NOT appear in bundle.
#   P3: *.test.ts excluded — packs/pms/utils/business-day-clock.test.ts must NOT
#       appear in bundle (test files are noise in distribution).
#   P4: packs/manifest.json generated, valid JSON, schema matches design §2.2
#       (generated_at, forge_version, packs[] each with name/forge_min_version/path).
#   P5: packs/README.md generated, lists pack + "可忽略" note + runnable-code hint.
#
# Runs against a temp git worktree copy so the real repo dist/ is untouched.
# Mirrors the mk_repo_copy pattern in build-dist-compile.test.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

pass=0
fail=0
assert() { if eval "$1"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $2"; fi; }

echo "── T-BUILD-DIST-PACKS: build-dist copies packs into bundle ──"

# Build a throwaway copy of the repo. Adds packs/ on top of the
# build-dist-compile.test.sh mk_repo_copy baseline.
mk_repo_copy() {
  local dest
  dest=$(mktemp -d)
  local src_root="${SCRIPT_DIR}"
  cp -R "${src_root}/src" "${dest}/src"
  cp "${src_root}/package.json" "${dest}/package.json"
  cp "${src_root}/tsconfig.json" "${dest}/tsconfig.json"
  cp -R "${src_root}/scripts" "${dest}/scripts"
  cp -R "${src_root}/templates" "${dest}/templates"
  cp -R "${src_root}/skills" "${dest}/skills"
  cp -R "${src_root}/agents" "${dest}/agents"
  cp -R "${src_root}/commands" "${dest}/commands"
  cp -R "${src_root}/hooks" "${dest}/hooks"
  cp -R "${src_root}/.claude-plugin" "${dest}/.claude-plugin"
  cp -R "${src_root}/packs" "${dest}/packs"
  cp "${src_root}/.mcp.json" "${dest}/.mcp.json" 2>/dev/null || true
  cp "${src_root}/README.md" "${dest}/README.md" 2>/dev/null || true
  ln -s "${src_root}/node_modules" "${dest}/node_modules"
  echo "$dest"
}

# node helper for JSON assertion (exit nonzero on failure, like test/run-test-helpers.sh)
json_has() {
  local file="$1"; local expr="$2"
  node -e "const j=JSON.parse(require('fs').readFileSync('$file','utf8'));if(!($expr)){process.exit(1)}" \
    2>/dev/null
}

TMP=$(mk_repo_copy)
cd "$TMP"
# build-dist may exit nonzero if optional inputs absent in the copy; capture.
build_out=$(bash "$TMP/scripts/build-dist.sh" 2>&1) || { echo "build-dist failed:"; echo "$build_out"; }

CC_BUNDLE="$TMP/dist/claude-code/bundles/tinkerman"
PLUGIN_DIST="$TMP/dist-plugin"

# --- P1: pack copied into BOTH bundles with expected contents ---
for bundle in "$CC_BUNDLE" "$PLUGIN_DIST"; do
  label="$(basename "$(dirname "$bundle")")/$(basename "$bundle")"
  assert "[[ -d \"$bundle/packs/pms\" ]]" "P1: packs/pms/ exists in $label"
  assert "[[ -f \"$bundle/packs/pms/pack.yaml\" ]]" "P1: pms/pack.yaml in $label"
  assert "[[ -d \"$bundle/packs/pms/contexts\" ]]" "P1: pms/contexts/ in $label"
  assert "[[ -d \"$bundle/packs/pms/state-machines\" ]]" "P1: pms/state-machines/ in $label"
  assert "[[ -f \"$bundle/packs/pms/utils/business-day-clock.ts\" ]]" "P1: pms/utils/business-day-clock.ts (source) in $label"
done

# --- P2: sample pack excluded from BOTH bundles ---
for bundle in "$CC_BUNDLE" "$PLUGIN_DIST"; do
  assert "! [[ -e \"$bundle/packs/pms-marriott-sample\" ]]" "P2: pms-marriott-sample excluded from $(basename "$bundle")"
done

# --- P3: *.test.ts excluded from BOTH bundles ---
for bundle in "$CC_BUNDLE" "$PLUGIN_DIST"; do
  assert "! [[ -e \"$bundle/packs/pms/utils/business-day-clock.test.ts\" ]]" "P3: business-day-clock.test.ts excluded from $(basename "$bundle")"
done

# --- P4: manifest.json generated in BOTH bundles, valid schema ---
for bundle in "$CC_BUNDLE" "$PLUGIN_DIST"; do
  m="$bundle/packs/manifest.json"
  label="$(basename "$bundle")"
  assert "[[ -f \"$m\" ]]" "P4: manifest.json exists in $label"
  assert "json_has \"$m\" \"j && Array.isArray(j.packs)\"" "P4: $label manifest has packs[] array"
  assert "json_has \"$m\" \"typeof j.generated_at === 'string'\"" "P4: $label manifest has generated_at"
  assert "json_has \"$m\" \"typeof j.forge_version === 'string'\"" "P4: $label manifest has forge_version"
  assert "json_has \"$m\" \"j.packs.some(p => p.name==='pms' && typeof p.forge_min_version==='string' && typeof p.path==='string')\"" "P4: $label manifest has pms entry with name/forge_min_version/path"
done

# --- P5: README.md generated in BOTH bundles ---
for bundle in "$CC_BUNDLE" "$PLUGIN_DIST"; do
  r="$bundle/packs/README.md"
  label="$(basename "$bundle")"
  assert "[[ -f \"$r\" ]]" "P5: README.md exists in $label packs/"
  assert "grep -q -i 'pms' \"$r\"" "P5: $label README lists pms"
  assert "grep -q -E '可忽略|可选' \"$r\"" "P5: $label README marks pack as optional/ignorable"
done

rm -rf "$TMP"

echo ""
echo "── T-BUILD-DIST-PACKS result: $pass passed, $fail failed ──"
[ $fail -eq 0 ]
