#!/usr/bin/env bash
# T-INIT-FLAGS — Parameterized non-interactive init test.
# category: user-facing
#
# Verifies `scripts/init.sh --non-interactive --name/--stack/--security/...
#           --no-ultrareview --bday-cutoff --bday-tz`:
#
#   F1: all flags flow into .forge/config.md frontmatter + body correctly
#   F2: --no-ultrareview suppresses .github/workflows/ultrareview.yml
#   F3: PMS --bday-* flags write business_day_* into config.md EXACTLY ONCE
#       (regression: previously had two write paths — heredoc + node -e)
#   F4: --stack bypasses the 1-7 menu case and lands verbatim in config.md
#   F5: --security 2/3 maps to both security_level (numeric) + label (中文)
#   F6: missing required flag WITHOUT --non-interactive blocks on read (non-zero
#       exit when stdin is closed); WITH --non-interactive defaults are used
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)/scripts"
INIT_SH="${SCRIPT_DIR}/init.sh"

mk_project() {
  local dir
  dir=$(mktemp -d)
  echo "$dir"
}

pass=0
fail=0
assert() { if eval "$1"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $2"; fi; }

echo "── T-INIT-FLAGS: Parameterized non-interactive init ──"

# --- F1: all flags flow into config.md ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" \
  --non-interactive \
  --name "flag-proj" \
  --stack "TypeScript, React, Node.js" \
  --security 2 \
  --ci-command "npm run check" \
  --no-ultrareview \
  2>&1) || true
assert '[[ -f "$TMP/.forge/config.md" ]]' "F1: .forge/config.md created"
assert 'grep -q "project: \"flag-proj\"" "$TMP/.forge/config.md"' "F1: --name → project: flag-proj"
assert 'grep -q "TypeScript" "$TMP/.forge/config.md"' "F1: --stack → stack array contains TypeScript"
assert 'grep -q "security_level: 2" "$TMP/.forge/config.md"' "F1: --security 2 → security_level: 2"
assert 'grep -q "ci_check_command: \"npm run check\"" "$TMP/.forge/config.md"' "F1: --ci-command → ci_check_command"
rm -rf "$TMP"

# --- F2: --no-ultrareview suppresses the workflow file ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" \
  --non-interactive \
  --name "no-ur" \
  --stack "TypeScript" \
  --security 1 \
  --no-ultrareview \
  2>&1) || true
assert '! [[ -f "$TMP/.github/workflows/ultrareview.yml" ]]' "F2: --no-ultrareview skips ultrareview.yml"
rm -rf "$TMP"

# --- F3: PMS --bday-* writes business_day_* EXACTLY ONCE (dedup regression) ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" \
  --non-interactive \
  --name "pms-proj" \
  --stack "TypeScript, Vue, Node.js" \
  --security 1 \
  --no-ultrareview \
  --pack pms \
  --bday-cutoff 6 \
  --bday-tz "UTC" \
  2>&1) || true
assert 'grep -q "business_day_cutoff_hour: 6" "$TMP/.forge/config.md"' "F3: bday cutoff written"
assert 'grep -q "UTC" "$TMP/.forge/config.md"' "F3: bday tz written"
# The dedup guarantee: the key appears exactly once in frontmatter.
count=$(grep -c "business_day_cutoff_hour:" "$TMP/.forge/config.md" || true)
assert '[ "$count" -eq 1 ]' "F3: business_day_cutoff_hour written EXACTLY ONCE (got $count)"
rm -rf "$TMP"

# --- F4: --stack with custom value bypasses the 1-7 menu ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" \
  --non-interactive \
  --name "custom-stack" \
  --stack "Rust, Axum" \
  --security 1 \
  --no-ultrareview \
  2>&1) || true
assert 'grep -q "Rust" "$TMP/.forge/config.md"' "F4: custom --stack value preserved verbatim"
assert 'grep -q "Axum" "$TMP/.forge/config.md"' "F4: custom --stack second item preserved"
rm -rf "$TMP"

# --- F5: --security maps to BOTH numeric level and 中文 label ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" \
  --non-interactive \
  --name "sec-proj" \
  --stack "TypeScript" \
  --security 3 \
  --no-ultrareview \
  2>&1) || true
assert 'grep -q "security_level: 3" "$TMP/.forge/config.md"' "F5: --security 3 → level 3"
assert 'grep -q "最高" "$TMP/.forge/config.md"' "F5: --security 3 → label 最高"
# CLAUDE.md also interpolates the label
assert '[[ -f "$TMP/CLAUDE.md" ]]' "F5: CLAUDE.md generated"
assert 'grep -q "最高" "$TMP/CLAUDE.md"' "F5: CLAUDE.md carries the security label"
rm -rf "$TMP"

# --- F6: missing flags WITHOUT --non-interactive blocks on read (stdin closed) ---
TMP=$(mk_project)
cd "$TMP"
set +e
output=$(bash "$INIT_SH" --name "stuck" --stack "TypeScript" --security 1 --no-ultrareview \
  </dev/null 2>&1)
exit_code=$?
set -e
# Without --non-interactive, the first read (re-init guard or project name) sees EOF.
# Behaviour today: read returns non-zero under set -euo pipefail → script aborts.
assert '[ $exit_code -ne 0 ]' "F6: no --non-interactive + closed stdin → non-zero exit"
rm -rf "$TMP"

# --- F6b: --non-interactive alone (no flags) still reaches the completion banner ---
# This is the init-companion-resilience.test.sh invariant restated for the flags path.
TMP=$(mk_project)
cd "$TMP"
output=$(yes "" 2>/dev/null | bash "$INIT_SH" --non-interactive 2>&1 || true)
assert 'echo "$output" | grep -q "Forge 初始化完成"' "F6b: --non-interactive alone reaches completion banner"
rm -rf "$TMP"

# --- F7: --ci-command preserves shell operators (&&, ||) verbatim ---
# Regression: sanitize() previously stripped & | ; ! from the character class,
# turning "pnpm build && pnpm test" into "pnpm build  pnpm test". Downstream
# contract (build/instructions.md "execute as-is") requires ci_check_command
# to survive init.sh untouched.
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" \
  --non-interactive \
  --name "amp-proj" \
  --stack "TypeScript" \
  --security 1 \
  --ci-command "pnpm build && pnpm test" \
  --no-ultrareview \
  2>&1) || true
# YAML frontmatter line (key: "value")
assert 'grep -q "^ci_check_command: \"pnpm build && pnpm test\"" "$TMP/.forge/config.md"' \
  "F7: --ci-command preserves && in YAML frontmatter"
# Markdown code block line (no indent inside the ```bash fence)
assert 'grep -q "^pnpm build && pnpm test$" "$TMP/.forge/config.md"' \
  "F7: --ci-command preserves && in code block"
rm -rf "$TMP"

# --- F8: --platform zcode generates .zcode/config.json (R1 AC2-7) ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" \
  --non-interactive \
  --name "zc-proj" \
  --stack "TypeScript" \
  --security 1 \
  --no-ultrareview \
  --platform zcode \
  2>&1) || true
assert '[[ -f "$TMP/.zcode/config.json" ]]' "F8: --platform zcode creates .zcode/config.json"
assert 'grep -q "\"enabled\": true" "$TMP/.zcode/config.json"' "F8: hooks.enabled is true"
assert 'grep -q "\"Stop\"" "$TMP/.zcode/config.json"' "F8: Stop event registered"
assert 'grep -q "CLAUDE_PLUGIN_ROOT" "$TMP/.zcode/config.json"' "F8: command uses CLAUDE_PLUGIN_ROOT (no hardcode)"
assert 'grep -q "stop-additional-context" "$TMP/.zcode/config.json"' "F8: command points to status-injection script"
# valid JSON
assert 'node -e "JSON.parse(require(\"fs\").readFileSync(\"$TMP/.zcode/config.json\",\"utf8\"))" 2>/dev/null' "F8: .zcode/config.json is valid JSON"
# completion output mentions it
assert 'echo "$output" | grep -q ".zcode/config.json"' "F8: completion banner lists .zcode/config.json"
rm -rf "$TMP"

# --- F8b: idempotent — existing .zcode/config.json not overwritten (R1 AC5) ---
TMP=$(mk_project)
cd "$TMP"
mkdir -p "$TMP/.zcode"
echo '{"existing": true}' > "$TMP/.zcode/config.json"
output=$(bash "$INIT_SH" \
  --non-interactive \
  --name "zc-idem" \
  --stack "TypeScript" \
  --security 1 \
  --no-ultrareview \
  --platform zcode \
  2>&1) || true
assert 'grep -q "\"existing\": true" "$TMP/.zcode/config.json"' "F8b: existing .zcode/config.json preserved (idempotent)"
assert 'echo "$output" | grep -q "已存在"' "F8b: warns about existing config"
rm -rf "$TMP"

# --- F8c: no --platform → no .zcode created (R1 AC1, R6.1 transparency) ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" \
  --non-interactive \
  --name "no-plat" \
  --stack "TypeScript" \
  --security 1 \
  --no-ultrareview \
  2>&1) || true
assert '! [[ -d "$TMP/.zcode" ]]' "F8c: no --platform → no .zcode directory"
rm -rf "$TMP"

# --- F8d: --platform unknown warns + ignores (non-blocking) ---
TMP=$(mk_project)
cd "$TMP"
output=$(bash "$INIT_SH" \
  --non-interactive \
  --name "unk-plat" \
  --stack "TypeScript" \
  --security 1 \
  --no-ultrareview \
  --platform unknownOS \
  2>&1) || true
assert 'echo "$output" | grep -qi "unknown"' "F8d: unknown platform warns"
assert '! [[ -d "$TMP/.zcode" ]]' "F8d: unknown platform → no .zcode created"
rm -rf "$TMP"

# --- F8e: --help lists --platform ---
output=$(bash "$INIT_SH" --help 2>&1)
assert 'echo "$output" | grep -q "\-\-platform"' "F8e: --help mentions --platform"
assert 'echo "$output" | grep -q "zcode"' "F8e: --help mentions zcode"

echo ""
echo "── T-INIT-FLAGS result: $pass passed, $fail failed ──"
[ $fail -eq 0 ]
