#!/usr/bin/env bash
# hook-postcompact.sh — Restore snapshot after compaction, inject to context
set -u
trap 'exit 0' ERR

SNAPSHOT_FILE=".forge/.compact-snapshot.md"
EVENTS_LOG=".forge/runs/$(date -u +%Y-%m-%d)-compact-events.jsonl"

log_event() {
  local event="$1" detail="${2:-}"
  mkdir -p .forge/runs
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"$event\",\"detail\":\"$detail\"}" >> "$EVENTS_LOG"
}

if [ ! -f "$SNAPSHOT_FILE" ]; then
  exit 0
fi

slug=$(grep '^slug=' "$SNAPSHOT_FILE" 2>/dev/null | head -1 | sed 's/slug=//' || true)

cat "$SNAPSHOT_FILE"

rm -f "$SNAPSHOT_FILE"

log_event "postcompact_restore" "slug=${slug:-unknown}"
exit 0
