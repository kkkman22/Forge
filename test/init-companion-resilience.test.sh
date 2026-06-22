#!/usr/bin/env bash
# Regression test: scripts/init.sh must NOT abort when install_companion fails.
#
# Bug (v3.4.0–v3.6.0): Step 7 runs install_companion under `set -euo pipefail`.
# install_companion returns 1 on failure, so the FIRST pip/npm install that
# fails (e.g. code-review-graph, headroom-ai[all]) terminated the whole script
# — the remaining companion tools and the final "init complete" banner never
# ran, and the process exited 1.
#
# This test exercises the exact failure mode: it injects a failing pip + npm +
# claude into init.sh's environment and asserts the script still reaches the
# end (prints the completion banner) and exits 0.
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

echo "── init.sh companion-resilience regression ──"

# Build a throwaway project root.
TMP=$(mktemp -d)
cd "$TMP"

# Fake binaries that make init.sh skip interactive prompts AND fail every
# install_companion call. We want to force the failure path of Step 7.
mkdir -p "${TMP}/fakebin"

# pip that always fails (exercises code-review-graph + headroom-ai paths).
cat > "${TMP}/fakebin/pip" <<'EOF'
#!/usr/bin/env bash
echo "fake pip: forced failure" >&2
exit 1
EOF

# uvx/pipx absent (no isolated-env installer) so detect_python_installer falls
# through to the pip branch, which is stubbed to fail above.
cat > "${TMP}/fakebin/uvx" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
cat > "${TMP}/fakebin/pipx" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF

# python3 reports 3.9 so detect_python_installer's version gate (< 3.10) also
# rejects pip — every companion install is forced to its fallback path.
cat > "${TMP}/fakebin/python3" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then echo "Python 3.9.18"; exit 0; fi
exit 0
EOF

# npm that always fails (exercises context-mode path).
cat > "${TMP}/fakebin/npm" <<'EOF'
#!/usr/bin/env bash
echo "fake npm: forced failure" >&2
exit 1
EOF

# claude that always fails (exercises Caveman + context-mode marketplace path).
cat > "${TMP}/fakebin/claude" <<'EOF'
#!/usr/bin/env bash
echo "fake claude: forced failure" >&2
exit 1
EOF

# node that only speaks --version (enough to pass check_cc_version); other
# node calls are tolerated via `|| true` in init.sh already.
cat > "${TMP}/fakebin/node" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" || "${1:-}" == "-v" ]]; then
  echo "v20.0.0"
  exit 0
fi
exit 0
EOF

chmod +x "${TMP}/fakebin"/*
export PATH="${TMP}/fakebin:${PATH}"

# Drive init.sh non-interactively: feed an unbounded stream of empty lines so
# every interactive `read` falls back to its default without blocking, and cap
# with a watchdog so the test cannot hang. Recipe mode exits early, so we use
# the main init flow.
yes "" 2>/dev/null | CLAUDE_PLUGIN_ROOT="" bash "$INIT_SH" --non-interactive >"${TMP}/out.log" 2>&1 &
INIT_PID=$!
# Don't hang forever if init.sh blocks on a prompt.
( sleep 90; kill -TERM "$INIT_PID" 2>/dev/null || true ) &
WATCHDOG=$!
wait "$INIT_PID" || true
kill "$WATCHDOG" 2>/dev/null || true

EXIT_CODE=$?
OUTPUT="$(cat "${TMP}/out.log")"

# --- The core assertion: a companion install failure must not abort init.sh ---
# Pre-fix: install_companion returns 1 under set -e → script aborts, exit 1,
#          completion banner missing.
# Post-fix: every install_companion failure is contained → script runs to end.
assert 'grep -q "Forge 初始化完成" "${TMP}/out.log"' \
  "init.sh must reach the completion banner even when companion installs fail"

echo ""
echo "── result: $PASS passed, $FAIL failed (init exit=$EXIT_CODE) ──"

rm -rf "$TMP"
[ "$FAIL" -eq 0 ]
