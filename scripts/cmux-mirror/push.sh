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

echo "$payload" | nc -U "$socket_path" 2>/dev/null || true
exit 0
