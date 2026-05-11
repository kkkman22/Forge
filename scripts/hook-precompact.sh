#!/usr/bin/env bash
# hook-precompact.sh — Save .forge/status.md snapshot before compaction
# NEVER exits with code 2 (blocking compaction is catastrophic)
set -u
trap 'exit 0' ERR

STATUS_FILE=".forge/status.md"
SNAPSHOT_FILE=".forge/.compact-snapshot.md"
EVENTS_LOG=".forge/runs/$(date -u +%Y-%m-%d)-compact-events.jsonl"

log_event() {
  local event="$1" detail="${2:-}"
  mkdir -p .forge/runs
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"$event\",\"detail\":\"$detail\"}" >> "$EVENTS_LOG"
}

if [ ! -f "$STATUS_FILE" ]; then
  log_event "precompact_skip" "status.md not found"
  exit 0
fi

slug=$(grep '^current_task:' "$STATUS_FILE" 2>/dev/null | sed 's/current_task: *"{\{0,1\}//;s/"}\{0,1\} *$//')
phase=$(grep '^phase:' "$STATUS_FILE" 2>/dev/null | sed 's/phase: *"{\{0,1\}//;s/"}\{0,1\} *$//')

# Sanitize: only allow alphanumeric, dash, underscore
slug=$(printf '%s' "$slug" | tr -cd 'a-zA-Z0-9_-')
phase=$(printf '%s' "$phase" | tr -cd 'a-zA-Z0-9_-')

if [ -z "$slug" ]; then
  log_event "precompact_skip" "no current_task in status.md"
  exit 0
fi

progress_tail=""
progress_file=".forge/progress/${slug}.md"
if [ -f "$progress_file" ]; then
  progress_tail=$(tail -3 "$progress_file" 2>/dev/null)
fi

pr_number=""
if [ -f "$STATUS_FILE" ]; then
  pr_number=$(grep '^pr_number:' "$STATUS_FILE" 2>/dev/null | sed 's/pr_number: *//')
fi

cat > "$SNAPSHOT_FILE" <<EOF
slug=${slug}
phase=${phase}
pr_number=${pr_number:-none}
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

## Progress tail
${progress_tail}
EOF

log_event "precompact_snapshot" "slug=$slug phase=$phase"
exit 0
