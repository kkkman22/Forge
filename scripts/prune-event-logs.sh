#!/usr/bin/env bash
# ============================================================================
# prune-event-logs.sh — Remove expired forge-loop run directories.
#
# Reads `event_log_retention_days` from `.forge/config.md` frontmatter
# (default: 30). Deletes any `.forge/runs/<runId>/` directory whose mtime
# is older than that cutoff.
#
# Usage:
#   bash scripts/prune-event-logs.sh            # normal run
#   bash scripts/prune-event-logs.sh --dry-run  # report only, no deletion
#
# Exit codes:
#   0 — success (including "nothing to prune")
#   1 — configuration or I/O error
# ============================================================================

set -euo pipefail

DRY_RUN="no"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="yes"
fi

CONFIG_FILE=".forge/config.md"
RUNS_DIR=".forge/runs"

# Default retention period, overridden by the config when present.
RETENTION_DAYS=30

# ---------------------------------------------------------------------------
# Read retention from config frontmatter
# ---------------------------------------------------------------------------

if [[ -f "${CONFIG_FILE}" ]]; then
  CONFIGURED=$(sed -n '/^---$/,/^---$/p' "${CONFIG_FILE}" 2>/dev/null \
    | (grep -E '^event_log_retention_days:' || true) \
    | head -1 \
    | sed 's/event_log_retention_days:[[:space:]]*//' \
    | tr -d '[:space:]')
  if [[ -n "${CONFIGURED:-}" ]] && [[ "${CONFIGURED}" =~ ^[0-9]+$ ]]; then
    RETENTION_DAYS="${CONFIGURED}"
  fi
fi

if [[ ! -d "${RUNS_DIR}" ]]; then
  echo "No ${RUNS_DIR} directory found — nothing to prune."
  exit 0
fi

echo "prune-event-logs: retention=${RETENTION_DAYS} days, dry_run=${DRY_RUN}"

# ---------------------------------------------------------------------------
# Find and prune stale run directories
# ---------------------------------------------------------------------------

# Use `find -mtime +N` to select directories older than N days.
STALE_DIRS=$(find "${RUNS_DIR}" -mindepth 1 -maxdepth 1 -type d \
  -mtime "+${RETENTION_DAYS}" 2>/dev/null)

if [[ -z "${STALE_DIRS}" ]]; then
  echo "No expired run directories."
  exit 0
fi

while IFS= read -r dir; do
  if [[ -z "${dir}" ]]; then continue; fi
  if [[ "${DRY_RUN}" == "yes" ]]; then
    echo "would prune: ${dir}"
  else
    echo "pruning: ${dir}"
    rm -rf -- "${dir}"
  fi
done <<< "${STALE_DIRS}"

exit 0
