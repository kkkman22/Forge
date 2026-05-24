#!/usr/bin/env bash
# hook-precompact.sh — Save rich .forge/ state snapshot before compaction
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

pr_number=""
if [ -f "$STATUS_FILE" ]; then
  pr_number=$(grep '^pr_number:' "$STATUS_FILE" 2>/dev/null | sed 's/pr_number: *//')
fi

# --- Rich snapshot: full progress, findings, active constraints ---

progress_content=""
progress_file=".forge/progress/${slug}.md"
if [ -f "$progress_file" ]; then
  # Cap at 100 lines to avoid bloating the snapshot
  progress_content=$(head -100 "$progress_file" 2>/dev/null)
fi

findings_content=""
findings_file=".forge/findings/${slug}.md"
if [ -f "$findings_file" ]; then
  findings_content=$(head -80 "$findings_file" 2>/dev/null)
fi

# Count completed vs pending tasks
completed=0
pending=0
if [ -f "$progress_file" ]; then
  completed=$(grep -c 'Status: DONE\|Status: COMPLETE\|\- \[x\]\|\- \[X\]' "$progress_file" 2>/dev/null || echo "0")
  pending=$(grep -c 'Status: PENDING\|Status: IN_PROGRESS\|\- \[ \]' "$progress_file" 2>/dev/null || echo "0")
fi

# Latest review result (if any)
review_summary=""
latest_review=$(ls -t .forge/reviews/*.md 2>/dev/null | head -1)
if [ -n "$latest_review" ] && [ -f "$latest_review" ]; then
  review_result=$(grep '^result:' "$latest_review" 2>/dev/null | sed 's/result: *//' | head -1)
  p0=$(grep '^p0_count:' "$latest_review" 2>/dev/null | sed 's/p0_count: *//' | head -1)
  p1=$(grep '^p1_count:' "$latest_review" 2>/dev/null | sed 's/p1_count: *//' | head -1)
  review_summary="result=${review_result:-unknown} p0=${p0:-?} p1=${p1:-?}"
fi

# Git state
git_branch=""
git_last_commit=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_branch=$(git branch --show-current 2>/dev/null || echo "")
  git_last_commit=$(git log --oneline -1 2>/dev/null || echo "")
fi

cat > "$SNAPSHOT_FILE" <<EOF
# Forge Compact Snapshot
# This file is auto-generated before context compaction and restored after.
# Do NOT edit manually.

slug=${slug}
phase=${phase}
pr_number=${pr_number:-none}
timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
git_branch=${git_branch:-unknown}
git_last_commit=${git_last_commit:-none}
tasks_completed=${completed:-0}
tasks_pending=${pending:-0}
review_status=${review_summary:-none}

## Progress (capped at 100 lines)
${progress_content:-No progress file found.}

## Key Findings (capped at 80 lines)
${findings_content:-No findings file found.}

## Active Constraints
Check .forge/status.md for current phase and .forge/plans/ for remaining tasks.
After compaction, read .forge/progress/${slug}.md for full task state.
EOF

log_event "precompact_snapshot" "slug=$slug phase=$phase completed=${completed:-0} pending=${pending:-0}"
exit 0
