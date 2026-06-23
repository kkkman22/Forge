#!/usr/bin/env bash
# T-INIT-CAPABILITY — completion-banner capability checklist
# category: user-facing
#
# Verifies init.sh prints a "能力最大化检查" block at completion that:
#   K1: source mode + forge plugin NOT globally installed → banner shows the
#       `claude plugin marketplace add` / `claude plugin install` guidance
#   K2: plugin mode (CLAUDE_PLUGIN_ROOT set) → banner shows "本次由插件运行"
#       and does NOT show the install guidance (no noise for installed users)
#   K3: .mcp.json contains forge-context → banner shows "需重启会话并批准"
#   K4: banner lists all 4 companion tools (CRG/Headroom/context-mode/Caveman)
#       regardless of install state
#
# Isolation: runs init.sh in a temp dir with a temp HOME so the real
# installed_plugins.json is never read or written.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INIT_SH="${SCRIPT_DIR}/scripts/init.sh"

pass=0
fail=0
assert() { if eval "$1"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $2"; fi; }

echo "── T-INIT-CAPABILITY: completion capability checklist ──"

# Run init.sh non-interactively under a throwaway HOME (empty plugin registry
# → forge plugin reports as "not installed"). CLAUDE_PLUGIN_ROOT is unset to
# simulate source mode. Prints captured to $1.
#
# PATH is trimmed to a stub dir holding ONLY a `node` symlink (not npm/claude/
# uvx/pip), so Step 7's companion installs find nothing and fast-skip via
# best-effort fallback. node/npm live in the same dir under fnm/nvm, so we
# can't just trim to node's bin dir — we build a stub with only `node`.
STUB_PATH=""
setup_stub_path() {
  local stub
  stub=$(mktemp -d)
  ln -s "$(command -v node)" "${stub}/node"
  STUB_PATH="${stub}:/usr/bin:/bin"
}

# Run init.sh non-interactively under a throwaway HOME (empty plugin registry
# → forge plugin reports as "not installed"). CLAUDE_PLUGIN_ROOT is unset to
# simulate source mode. Prints captured to $1.
run_init_source_mode() {
  local out_var="$1"
  local tmp_home
  tmp_home=$(mktemp -d)
  local tmp_proj
  tmp_proj=$(mktemp -d)
  cd "$tmp_proj"
  local output
  output=$(env -i HOME="$tmp_home" PATH="$STUB_PATH" \
    bash "$INIT_SH" --non-interactive --name "captest" --stack "TypeScript" \
    --security 1 --no-ultrareview 2>&1) || true
  eval "$out_var=\"\$output\""
  rm -rf "$tmp_home" "$tmp_proj"
}

setup_stub_path

# --- K1: source mode, plugin absent → install guidance shown ---
OUT=""
run_init_source_mode OUT
assert 'echo "$OUT" | grep -q "marketplace add https://github.com/kkkman22/Forge"' \
  "K1: source mode shows plugin marketplace add guidance"
assert 'echo "$OUT" | grep -q "claude plugin install forge"' \
  "K1: source mode shows plugin install command"

# --- K2: plugin mode (CLAUDE_PLUGIN_ROOT set) → no install guidance ---
# Use a temp HOME with no plugin registry AND set CLAUDE_PLUGIN_ROOT to a dir
# that has an agents/ subdir (mirrors detect_forge_root 情况0).
OUT=""
tmp_home=$(mktemp -d)
tmp_proj=$(mktemp -d)
fake_plugin_root=$(mktemp -d)
mkdir -p "${fake_plugin_root}/agents"
cd "$tmp_proj"
OUT=$(env -i HOME="$tmp_home" PATH="$STUB_PATH" CLAUDE_PLUGIN_ROOT="$fake_plugin_root" \
  bash "$INIT_SH" --non-interactive --name "captest" --stack "TypeScript" \
  --security 1 --no-ultrareview 2>&1) || true
assert 'echo "$OUT" | grep -q "本次由插件运行"' \
  "K2: plugin mode shows '本次由插件运行'"
assert '! echo "$OUT" | grep -q "claude plugin install forge"' \
  "K2: plugin mode does NOT show install guidance (no noise)"
rm -rf "$tmp_home" "$tmp_proj" "$fake_plugin_root"

# --- K3: .mcp.json with forge-context → MCP approval guidance ---
# init.sh writes .mcp.json itself when the forge-context.mjs exists; the
# guidance fires whenever .mcp.json contains "forge-context". Run source mode
# (which writes .mcp.json) and check the approval line appears.
OUT=""
run_init_source_mode OUT
assert 'echo "$OUT" | grep -q "需重启会话并批准"' \
  "K3: MCP approval guidance shown when forge-context configured"

# --- K4: banner lists all 4 companion tools ---
OUT=""
run_init_source_mode OUT
assert 'echo "$OUT" | grep -q "CRG（代码知识图谱）"' "K4: CRG listed"
assert 'echo "$OUT" | grep -q "Headroom（API 级压缩）"' "K4: Headroom listed"
assert 'echo "$OUT" | grep -q "context-mode（大输出沙箱）"' "K4: context-mode listed"
assert 'echo "$OUT" | grep -q "Caveman（回复压缩）"' "K4: Caveman listed"

echo ""
echo "── T-INIT-CAPABILITY result: $pass passed, $fail failed ──"
[ $fail -eq 0 ]
