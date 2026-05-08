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
cmux notify "Forge Frozen" "Branch frozen for: ${task_name}" 2>/dev/null || true
cmux log "hook-notify: frozen interception for ${task_name}" 2>/dev/null || true

# Step 3: Always exit 0 (R6.1, R12.7)
exit 0
