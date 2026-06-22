#!/usr/bin/env bash
# Regression test: scripts/init.sh must NOT write Forge hooks into the
# project .claude/settings.json when running in marketplace mode
# (CLAUDE_PLUGIN_ROOT set + <root>/agents exists).
#
# Bug (defect 1, marketplace-install-hook-bugs report): init.sh Step 5
# unconditionally copied/merged hooks/hooks.json into the PROJECT settings.json.
# In marketplace mode the plugin's own hooks/hooks.json is the sole source of
# hooks, and Claude Code rejects ${CLAUDE_PLUGIN_ROOT} at project scope — so a
# project-side copy only produces dead-path / rejected-literal noise. Project
# settings.json should carry env only, never hooks.
#
# This test fakes a plugin root (with an agents/ dir so detect_forge_root
# recognizes marketplace mode), runs init.sh --non-interactive, and asserts:
#   1. project .claude/settings.json does NOT contain a "hooks" key
#   2. project .claude/settings.json DOES contain an "env" key (env write preserved)
#   3. completion banner still reached
#
# category: user-facing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INIT_SH="${SCRIPT_DIR}/scripts/init.sh"
PASS=0
FAIL=0

assert() {
  if eval "$1"; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    echo "FAIL: $2"
  fi
}

echo "── init.sh marketplace-mode skips project hooks ──"

TMP=$(mktemp -d)
cd "$TMP"

# Fake plugin root: detect_forge_root requires ${CLAUDE_PLUGIN_ROOT}/agents to exist.
FAKE_PLUGIN="${TMP}/fake-plugin"
mkdir -p "${FAKE_PLUGIN}/agents"

# Minimal fakebin: use the REAL node (init.sh drives several `node -e` scripts
# for settings.json merging and env writing that a stub cannot satisfy). Only
# pip/npm/claude/git/code-review-graph are stubbed to instant no-ops so Step 7
# companion installs neither block nor write hooks into project settings.
mkdir -p "${TMP}/fakebin"
for bin in pip pip3 npm claude git code-review-graph; do
  cat > "${TMP}/fakebin/${bin}" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
done
chmod +x "${TMP}/fakebin"/*
# Prepend fakebin but keep the real node on PATH.
export PATH="${TMP}/fakebin:${PATH}"

# Drive init.sh in MARKETPLACE mode.
yes "" 2>/dev/null | CLAUDE_PLUGIN_ROOT="${FAKE_PLUGIN}" bash "$INIT_SH" --non-interactive >"${TMP}/out.log" 2>&1 &
INIT_PID=$!
( sleep 90; kill -TERM "$INIT_PID" 2>/dev/null || true ) &
WATCHDOG=$!
wait "$INIT_PID" || true
kill "$WATCHDOG" 2>/dev/null || true
EXIT_CODE=$?

SETTINGS="${TMP}/.claude/settings.json"

# 1. Project settings.json must NOT carry Forge hooks in marketplace mode.
if [[ -f "$SETTINGS" ]]; then
  assert '! grep -q "\"hooks\"" "$SETTINGS"' \
    "marketplace mode: project settings.json must NOT contain a hooks key"
  assert 'grep -q "\"env\"" "$SETTINGS"' \
    "marketplace mode: project settings.json must still contain env"
else
  # If settings.json was never created, that also satisfies "no hooks" — but env
  # write should have created it, so flag the absence as a failure for the env assertion.
  PASS=$((PASS+1))
  echo "note: settings.json not created"
  FAIL=$((FAIL+1))
  echo "FAIL: marketplace mode: project settings.json should exist with env"
fi

# 2. Completion banner must still be reached.
assert 'grep -q "Forge 初始化完成" "${TMP}/out.log"' \
  "init.sh must reach the completion banner in marketplace mode"

echo ""
echo "── result: $PASS passed, $FAIL failed (init exit=$EXIT_CODE) ──"

rm -rf "$TMP"
[ "$FAIL" -eq 0 ]
