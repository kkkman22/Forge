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
current_package=""
completed_packages=""
next_package=""
package_count=""
if [ -f "$STATUS_FILE" ]; then
  pr_number=$(grep '^pr_number:' "$STATUS_FILE" 2>/dev/null | sed 's/pr_number: *//')
  current_package=$(grep '^current_package:' "$STATUS_FILE" 2>/dev/null | sed 's/current_package: *"\{0,1\}//;s/"\{0,1\} *$//')
  completed_packages=$(grep '^completed_packages:' "$STATUS_FILE" 2>/dev/null | sed 's/completed_packages: *"\{0,1\}//;s/"\{0,1\} *$//')
  next_package=$(grep '^next_package:' "$STATUS_FILE" 2>/dev/null | sed 's/next_package: *"\{0,1\}//;s/"\{0,1\} *$//')
  package_count=$(grep '^package_count:' "$STATUS_FILE" 2>/dev/null | sed 's/package_count: *//')
fi

# --- Restate reminder config ---
restate_reminder="off"
restate_threshold=3
if [ -f ".forge/config.md" ]; then
  _val=$(grep '^forge_compact_restate_reminder:' ".forge/config.md" 2>/dev/null | sed 's/forge_compact_restate_reminder: *//' | tr -d '[:space:]')
  [ -n "$_val" ] && restate_reminder="$_val"
  _val=$(grep '^forge_compact_restate_threshold_tasks:' ".forge/config.md" 2>/dev/null | sed 's/forge_compact_restate_threshold_tasks: *//' | tr -d '[:space:]')
  [ -n "$_val" ] && restate_threshold="$_val"
fi

# --- Rich snapshot: progress, findings, active constraints ---

progress_content=""
progress_file=".forge/progress/${slug}.md"
if [ -f "$progress_file" ]; then
  # Cap at 60 lines to stay under 10k-char hook output limit
  progress_content=$(head -60 "$progress_file" 2>/dev/null)
fi

findings_content=""
findings_file=".forge/findings/${slug}.md"
if [ -f "$findings_file" ]; then
  findings_content=$(head -40 "$findings_file" 2>/dev/null)
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

# --- Build restate reminder if threshold met ---
restate_reminder_section=""
if [ "$restate_reminder" = "on" ] && [ "${completed:-0}" -ge "$restate_threshold" ] 2>/dev/null; then
  restate_reminder_section="⚠️ RESTATE REMINDER: ${completed:-0} tasks completed (threshold: ${restate_threshold}).
After compaction recovery, run restatement checkpoint first: re-read .forge/progress/ and update state."
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
current_package=${current_package:-none}
completed_packages=${completed_packages:-none}
next_package=${next_package:-none}
package_count=${package_count:-none}

## Progress (capped at 60 lines)
${progress_content:-No progress file found.}

## Key Findings (capped at 40 lines)
${findings_content:-No findings file found.}

## Active Constraints
Check .forge/status.md for current phase and .forge/plans/ for remaining tasks.
After compaction, read .forge/progress/${slug}.md for full task state.
${restate_reminder_section:-}
EOF

log_event "precompact_snapshot" "slug=$slug phase=$phase completed=${completed:-0} pending=${pending:-0}"
exit 0
