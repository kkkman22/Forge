#!/usr/bin/env bash
# hook-postcompact.sh — Restore snapshot after compaction, inject to context
#
# regenerative-checkpoint R3 Task 6: output the snapshot (from hook-precompact.sh,
# which may be checkpoint.md-sourced or legacy grep fallback) followed by a
# seam-framing block that tells the agent the preserved messages are real
# history and to resume directly without recapping.
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
slug=$(printf '%s' "${slug:-}" | tr -cd 'a-zA-Z0-9_-')

# Sanity check: snapshot must have expected header
if ! grep -q '^slug=' "$SNAPSHOT_FILE" 2>/dev/null; then
  rm -f "$SNAPSHOT_FILE"
  exit 0
fi

snapshot_source=$(grep '^snapshot_source=' "$SNAPSHOT_FILE" 2>/dev/null | head -1 | sed 's/snapshot_source=//' | tr -cd 'a-zA-Z0-9_-' || true)

# Output the snapshot content.
# regenerative-checkpoint R3/P1-fix: when source=checkpoint, apply section-aware
# budget truncation via compact-inject.mjs so large checkpoints don't flood the
# rebuilt context (D9: GLM-5.2 600K compact). Falls back to raw cat on any error.
if [ "$snapshot_source" = "checkpoint" ] && [ -f ".forge/checkpoint.md" ]; then
  # Resolve compact-inject.mjs relative to this hook script (handles plugin install paths).
  inject_script="$(cd "$(dirname "$0")" && pwd)/compact-inject.mjs"
  if [ -f "$inject_script" ] && command -v node >/dev/null 2>&1; then
    node "$inject_script" ".forge/checkpoint.md" 11000 2>/dev/null || cat "$SNAPSHOT_FILE"
  else
    cat "$SNAPSHOT_FILE"
  fi
else
  cat "$SNAPSHOT_FILE"
fi

# regenerative-checkpoint R3: seam framing — anchor the agent that preserved
# messages below are real history (not pseudo-content), so it resumes the task
# mid-loop instead of asking "what would you like me to do" or recapping.
cat <<'SEAM'

---

This session continues from a compaction checkpoint. The state snapshot above
covers the earlier portion. Recent messages preserved below are real history,
not pseudo-content — process them and continue the task directly.

Resume immediately. Do not recap, do not preface with "I'll continue" or
similar. Pick up the last task as if the break never happened. If you need
specific details, Read .forge/checkpoint.md (full) or .forge/progress/ rather
than asking the user to restate.
SEAM

rm -f "$SNAPSHOT_FILE"

log_event "postcompact_restore" "slug=${slug:-unknown} source=${snapshot_source:-unknown}"
exit 0
