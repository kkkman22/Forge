#!/usr/bin/env bash
# push.sh — Thin wrapper to send a single NDJSON event to Mirror_Push_Socket.
# Usage: push.sh <socket_path> <json_payload>
set -euo pipefail

socket_path="${1:?Usage: push.sh <socket_path> <json_payload>}"
payload="${2:?Usage: push.sh <socket_path> <json_payload>}"

if [[ ! -S "$socket_path" ]]; then
  echo "push.sh: socket not found at $socket_path" >&2
  exit 0
fi

# R1.3: Inject window_id when CMUX_WINDOW_ID is set
if [[ -n "${CMUX_WINDOW_ID:-}" ]]; then
  if command -v jq >/dev/null 2>&1; then
    payload=$(printf '%s' "$payload" | jq --arg wid "$CMUX_WINDOW_ID" '. + {window_id: $wid}' 2>/dev/null || printf '%s' "$payload")
  fi
fi

echo "$payload" | nc -U -w 1 "$socket_path" 2>/dev/null || true
exit 0
