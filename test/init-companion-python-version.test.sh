#!/usr/bin/env bash
# Regression test: scripts/init.sh companion installs must detect Python
# version and prefer uvx/pipx, rather than blindly calling a pip whose
# underlying Python is < 3.10 (which packages like code-review-graph and
# headroom-ai require).
#
# Bug (defect 3, marketplace-install-hook-bugs report): detect_pip() only
# checked whether `pip`/`pip3` was on PATH, not the underlying interpreter
# version. On systems where the default pip points at Python < 3.10 (e.g. a
# conda 3.9 base), `pip install code-review-graph` hit PyPI's
# `Requires-Python >=3.10` rejection and printed a misleading "install failed"
# even though the tool is best-effort and has a graceful fallback.
#
# This test exercises two scenarios via stubbed binaries:
#   A. uvx present      → companion install routed through uvx (no pip call)
#   B. no uvx/pipx + pip→python3.9 → install SKIPPED with an explicit version
#      hint, init.sh still reaches the completion banner (best-effort, no abort)
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

# Run init.sh in a throwaway project with a hand-crafted fakebin on PATH.
# $1 = PATH extras key (uvx-only | none); sets up stubs accordingly.
run_init() {
  local mode="$1"
  TMP=$(mktemp -d)
  cd "$TMP"
  mkdir -p "${TMP}/fakebin"

  # Real node is required (init.sh drives node -e for settings/env work).
  # Stub pip/pip3 to point at a Python 3.9 interpreter (the bug trigger).
  # python3 reports 3.9 so version check should reject it.
  cat > "${TMP}/fakebin/python3" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then echo "Python 3.9.18"; exit 0; fi
exit 0
EOF
  cat > "${TMP}/fakebin/pip" <<'EOF'
#!/usr/bin/env bash
echo "fake pip: should NOT be called when uvx is available or version < 3.10" >&2
echo "PIP_CALLED=1"
exit 1
EOF
  # Record whether pip was invoked (grepped from the marker file).
  cat > "${TMP}/fakebin/pip3" <<'EOF'
#!/usr/bin/env bash
echo "fake pip3: should NOT be called" >&2
exit 1
EOF
  for bin in npm claude git code-review-graph; do
    printf '#!/usr/bin/env bash\nexit 0\n' > "${TMP}/fakebin/${bin}"
  done

  if [[ "$mode" == "uvx-only" ]]; then
    # uvx stub that records its invocation.
    cat > "${TMP}/fakebin/uvx" <<EOF
#!/usr/bin/env bash
echo "uvx called with: \$*" >> "${TMP}/uvx-calls.log"
exit 0
EOF
  fi

  chmod +x "${TMP}/fakebin"/*
  export PATH="${TMP}/fakebin:${PATH}"

  yes "" 2>/dev/null | CLAUDE_PLUGIN_ROOT="" bash "$INIT_SH" --non-interactive >"${TMP}/out.log" 2>&1 &
  INIT_PID=$!
  ( sleep 90; kill -TERM "$INIT_PID" 2>/dev/null || true ) &
  WATCHDOG=$!
  wait "$INIT_PID" || true
  kill "$WATCHDOG" 2>/dev/null || true
}

echo "── init.sh companion Python-version detection ──"

# --- Scenario A: uvx present → companion installs routed through uvx ---
run_init "uvx-only"
echo "[A] uvx present:"
assert 'grep -q "Forge 初始化完成" "${TMP}/out.log"' \
  "A: init must reach completion banner"
assert '[[ -f "${TMP}/uvx-calls.log" ]]' \
  "A: uvx must be invoked for companion installs"
assert 'grep -q -- "--from code-review-graph" "${TMP}/uvx-calls.log"' \
  "A: uvx must be invoked with --from code-review-graph (correct package routing)"
assert 'grep -q -- "--from headroom-ai" "${TMP}/uvx-calls.log"' \
  "A: uvx must be invoked with --from headroom-ai (package != command)"
assert '! grep -q "PIP_CALLED" "${TMP}/out.log"' \
  "A: pip must NOT be called when uvx is available"
UVX_A_TMP="$TMP"

# --- Scenario B: no uvx/pipx + Python 3.9 → skip with explicit hint ---
run_init "none"
echo "[B] no uvx/pipx, Python 3.9:"
assert 'grep -q "Forge 初始化完成" "${TMP}/out.log"' \
  "B: init must reach completion banner (best-effort, no abort)"
assert 'grep -Eq "3\.10|python.*version|Python.*版本|建议" "${TMP}/out.log"' \
  "B: init must print a Python version hint when pip < 3.10"
assert '! grep -q "PIP_CALLED" "${TMP}/out.log"' \
  "B: pip install must be SKIPPED (not invoked) when Python < 3.10"

echo ""
echo "── result: $PASS passed, $FAIL failed ──"

rm -rf "$UVX_A_TMP" "$TMP"
[ "$FAIL" -eq 0 ]
