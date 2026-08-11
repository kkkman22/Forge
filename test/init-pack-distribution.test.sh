#!/usr/bin/env bash
# T-INIT-PACK-DISTRIBUTION — plugin/clone pack distribution (slice A' REQ-05/06)
# category: user-facing
#
# Verifies the packs-plugin-distribution init.sh changes:
#
#   D1 (core fix): plugin install path with CLAUDE_PLUGIN_ROOT pointing at a
#       bundle that contains packs/pms/ + packs/manifest.json →
#       `init.sh --pack pms` NO LONGER warns "功能将不可用" (the lie bug).
#   D2 (manifest guard): when pack is present but NOT listed in manifest.json
#       → init warns "未随此 Forge 版本分发" but still configures (graceful).
#   D3 (telemetry): after a successful --pack pms enable, the project's
#       .tinkerman/knowledge/tool-health.md contains a `· pack-enabled ·` record
#       with name=pms and source=plugin|clone.
#   D4 (INV-1 regression): git clone scenario (no CLAUDE_PLUGIN_ROOT, packs/
#       present in repo) still enables the pack without the "不可用" warning.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INIT_SH="${SCRIPT_DIR}/scripts/init.sh"

pass=0
fail=0
assert() { if eval "$1"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $2"; fi; }

echo "── T-INIT-PACK-DISTRIBUTION: plugin/clone pack distribution (REQ-05/06) ──"

# Build a fake plugin bundle: CLAUDE_PLUGIN_ROOT must point at a dir with
# agents/ (detect_forge_root plugin probe) + packs/<name>/ + packs/manifest.json.
mk_plugin_bundle() {
  local src_root="${SCRIPT_DIR}"
  local bundle
  bundle=$(mktemp -d)
  # detect_forge_root plugin probe: CLAUDE_PLUGIN_ROOT/agents must exist
  mkdir -p "${bundle}/agents"
  touch "${bundle}/agents/.keep"
  # init.sh also reads skills/commands/templates/hooks/scripts/dist from FORGE_ROOT
  cp -R "${src_root}/skills" "${bundle}/skills"
  cp -R "${src_root}/templates" "${bundle}/templates"
  cp -R "${src_root}/hooks" "${bundle}/hooks"
  mkdir -p "${bundle}/scripts"
  cp "${src_root}/scripts/init.sh" "${bundle}/scripts/init.sh"
  chmod +x "${bundle}/scripts/init.sh"
  cp "${src_root}/scripts/validate-knowledge.sh" "${bundle}/scripts/validate-knowledge.sh" 2>/dev/null || true
  echo "$bundle"
}

# Put a pack + manifest into a bundle (mirrors build-dist output)
seed_packs() {
  local bundle="$1"; local with_manifest="$2"
  mkdir -p "${bundle}/packs/pms"
  cat > "${bundle}/packs/pms/pack.yaml" <<'YAML'
name: pms
display_name: "Hotel PMS Domain Pack"
forge_min_version: "2.4.0"
YAML
  mkdir -p "${bundle}/packs/pms/contexts"
  echo "# reservations" > "${bundle}/packs/pms/contexts/reservations.md"
  if [[ "${with_manifest}" == "yes" ]]; then
    cat > "${bundle}/packs/manifest.json" <<'JSON'
{
  "generated_at": "2026-06-27T12:00:00.000Z",
  "forge_version": "3.9.0",
  "packs": [
    { "name": "pms", "forge_min_version": "2.4.0", "path": "packs/pms" }
  ]
}
JSON
  fi
}

mk_project() { mktemp -d; }

# --- D1: plugin path, pack present + in manifest → no "不可用" warning ---
BUNDLE=$(mk_plugin_bundle)
seed_packs "${BUNDLE}" yes
PROJ=$(mk_project)
cd "${PROJ}"
out=$(CLAUDE_PLUGIN_ROOT="${BUNDLE}" bash "${BUNDLE}/scripts/init.sh" \
  --non-interactive --name "plug-proj" --stack "TypeScript" --security 1 \
  --no-ultrareview --pack pms 2>&1) || true
assert '! echo "$out" | grep -q "功能将不可用"' "D1: plugin --pack pms does NOT warn 不可用"
assert 'echo "$out" | grep -q "PMS Pack"' "D1: plugin --pack pms activates PMS pack"
rm -rf "${PROJ}" "${BUNDLE}"

# --- D2: pack present but not in manifest → graceful warn, still configured ---
BUNDLE=$(mk_plugin_bundle)
seed_packs "${BUNDLE}" yes
# Now remove pms from the manifest (keep manifest.json valid, pack list empty)
cat > "${BUNDLE}/packs/manifest.json" <<'JSON'
{ "generated_at": "x", "forge_version": "3.9.0", "packs": [] }
JSON
PROJ=$(mk_project)
cd "${PROJ}"
out=$(CLAUDE_PLUGIN_ROOT="${BUNDLE}" bash "${BUNDLE}/scripts/init.sh" \
  --non-interactive --name "drift-proj" --stack "TypeScript" --security 1 \
  --no-ultrareview --pack pms 2>&1) || true
assert 'echo "$out" | grep -qiE "未随此 Forge 版本分发"' "D2: pack not in manifest → graceful warn"
rm -rf "${PROJ}" "${BUNDLE}"

# --- D3: telemetry — successful enable writes tool-health.md record ---
BUNDLE=$(mk_plugin_bundle)
seed_packs "${BUNDLE}" yes
PROJ=$(mk_project)
cd "${PROJ}"
out=$(CLAUDE_PLUGIN_ROOT="${BUNDLE}" bash "${BUNDLE}/scripts/init.sh" \
  --non-interactive --name "telem-proj" --stack "TypeScript" --security 1 \
  --no-ultrareview --pack pms 2>&1) || true
assert 'grep -q "pack-enabled" "${PROJ}/.tinkerman/knowledge/tool-health.md"' "D3: tool-health.md has pack-enabled record"
assert 'grep -q "name=pms" "${PROJ}/.tinkerman/knowledge/tool-health.md"' "D3: pack-enabled record carries name=pms"
assert 'grep -qE "source=(plugin|clone)" "${PROJ}/.tinkerman/knowledge/tool-health.md"' "D3: pack-enabled record carries source"
rm -rf "${PROJ}" "${BUNDLE}"

# --- D4 (INV-1): clone scenario still works (no CLAUDE_PLUGIN_ROOT) ---
BUNDLE=$(mk_plugin_bundle)
seed_packs "${BUNDLE}" yes
PROJ=$(mk_project)
cd "${PROJ}"
out=$(env -u CLAUDE_PLUGIN_ROOT bash "${BUNDLE}/scripts/init.sh" \
  --non-interactive --name "clone-proj" --stack "TypeScript" --security 1 \
  --no-ultrareview --pack pms 2>&1) || true
assert '! echo "$out" | grep -q "功能将不可用"' "D4 (INV-1): clone scenario does NOT warn 不可用"
assert 'echo "$out" | grep -q "PMS Pack"' "D4 (INV-1): clone scenario activates PMS pack"
rm -rf "${PROJ}" "${BUNDLE}"

# --- D5 (SECURITY, S-001): malicious --pack value is rejected (RCE sink closed) ---
# Regression guard for the pack_name command-injection fix. A payload that
# would inject into the node -e manifest check must be rejected at parse time.
BUNDLE=$(mk_plugin_bundle)
seed_packs "${BUNDLE}" yes
PROJ=$(mk_project)
cd "${PROJ}"
set +e
out=$(CLAUDE_PLUGIN_ROOT="${BUNDLE}" bash "${BUNDLE}/scripts/init.sh" \
  --non-interactive --name "sec-proj" --stack "TypeScript" --security 1 \
  --no-ultrareview --pack "pms'); var cp=require('child_process'); cp.execSync('touch /tmp/forge-rce-marker'); var _=(' " \
  2>&1)
exit_code=$?
set -e
assert '[ $exit_code -ne 0 ]' "D5 (S-001): malicious --pack rejected (non-zero exit)"
assert 'echo "$out" | grep -q "非法字符"' "D5 (S-001): malicious --pack shows 非法字符 error"
assert '! [ -f /tmp/forge-rce-marker ]' "D5 (S-001): NO RCE marker file created (injection blocked)"
rm -rf "${PROJ}" "${BUNDLE}" /tmp/forge-rce-marker

echo ""
echo "── T-INIT-PACK-DISTRIBUTION result: $pass passed, $fail failed ──"
[ $fail -eq 0 ]
