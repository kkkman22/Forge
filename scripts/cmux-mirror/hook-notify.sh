#!/usr/bin/env bash
# hook-notify.sh — Frozen interception notification (R6.1–R6.7).
# Fires cmux notification + log when Forge detects a frozen branch.
# All cmux calls are best-effort; exit is always 0 (R6.1).
set -uo pipefail

forge_dir="${1:-.forge}"

# Validate path: reject traversal and shell metacharacters
if [[ "$forge_dir" =~ \.\. || "$forge_dir" =~ [\;\|\`\$\(] ]]; then
  exit 0
fi

# Zero-impact fallback: if the target Forge directory does not exist, there is
# no state to mirror and no dedupe file to update. Exit before any cmux call.
if [[ ! -d "$forge_dir" ]]; then
  exit 0
fi

dedupe_dir="${forge_dir}/.cmux-dedupe"
dedupe_window_ms="${HOOK_NOTIFY_DEDUPE_WINDOW_MS:-30000}"

# Step 1: Check dedupe (R6.2)
dedupe_hash=""
if command -v shasum &>/dev/null; then
  dedupe_hash=$(printf '%s' "$forge_dir" | shasum | cut -d' ' -f1)
elif command -v sha1sum &>/dev/null; then
  dedupe_hash=$(printf '%s' "$forge_dir" | sha1sum | cut -d' ' -f1)
else
  dedupe_hash="default"
fi

dedupe_ts_file="${dedupe_dir}/${dedupe_hash}.ts"
now_ms=$(date +%s000 2>/dev/null || echo "0")

if [[ -f "$dedupe_ts_file" ]]; then
  last_ts=$(cat "$dedupe_ts_file" 2>/dev/null || echo "0")
  if [[ "$now_ms" != "0" && "$last_ts" != "0" ]]; then
    diff=$(( now_ms - last_ts ))
    if [[ "$diff" -lt "$dedupe_window_ms" ]]; then
      # Within dedupe window — skip (R6.2)
      exit 0
    fi
  fi
fi

# Record timestamp
mkdir -p "$dedupe_dir" 2>/dev/null || true
echo "$now_ms" > "$dedupe_ts_file" 2>/dev/null || true

# Step 2: Notify via cmux (R6.3) — best-effort
task_name="${FORGE_TASK:-unknown}"

# R1.4: Construct --window prefix when CMUX_WINDOW_ID is set and valid
window_args=()
if [[ -n "${CMUX_WINDOW_ID:-}" ]]; then
  # R1.6: Validate against whitelist (must match cli.mjs SAFE_WINDOW_ID)
  if [[ "$CMUX_WINDOW_ID" =~ ^[A-Za-z0-9._:-]{1,64}$ ]] && [[ "$CMUX_WINDOW_ID" != *".."* ]]; then
    window_args=("--window" "$CMUX_WINDOW_ID")
  fi
fi

run_cmux_best_effort() {
  command -v cmux >/dev/null 2>&1 || return 0

  local timeout_ms="${HOOK_NOTIFY_CMUX_TIMEOUT_MS:-500}"
  if [[ ! "$timeout_ms" =~ ^[0-9]+$ ]]; then
    timeout_ms=500
  fi

  cmux "${window_args[@]}" "$@" >/dev/null 2>&1 &
  local pid=$!
  local waited_ms=0

  while kill -0 "$pid" 2>/dev/null; do
    if (( waited_ms >= timeout_ms )); then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 0
    fi
    sleep 0.05
    waited_ms=$(( waited_ms + 50 ))
  done

  wait "$pid" 2>/dev/null || true
}

run_cmux_best_effort notify "Forge Frozen" "Branch frozen for: ${task_name}"
run_cmux_best_effort log "hook-notify: frozen interception for ${task_name}"

# R3.1: Trigger jump to unread workspace (cmux 0.64.5+; || true for older versions)
run_cmux_best_effort notification jump-to-unread

# Step 3: Always exit 0 (R6.1, R12.7)
exit 0
