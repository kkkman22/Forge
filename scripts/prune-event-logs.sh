#!/usr/bin/env bash
# category: user-facing
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
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: scripts/prune-event-logs.sh [--dry-run]"
  echo ""
  echo "Remove expired .forge/runs/ directories based on retention config."
  echo "  --dry-run  Report what would be deleted without actually deleting"
  exit 0
elif [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="yes"
fi

CONFIG_FILE=".forge/config.md"
RUNS_DIR=".forge/runs"
ASSETS_DIR=".forge/reviews/assets"
ARCHIVE_DIR=".forge/archive/reviews"
ACCEPTANCE_DIR=".forge/acceptance"
ACCEPTANCE_ARCHIVE=".forge/archive/acceptance"

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

# ---------------------------------------------------------------------------
# Archive stale review assets (.forge/reviews/assets/*)
# ---------------------------------------------------------------------------

if [[ -d "${ASSETS_DIR}" ]]; then
  STALE_ASSETS=$(find "${ASSETS_DIR}" -type f -mtime "+${RETENTION_DAYS}" 2>/dev/null)
  if [[ -n "${STALE_ASSETS}" ]]; then
    if [[ "${DRY_RUN}" != "yes" ]]; then
      mkdir -p "${ARCHIVE_DIR}"
    fi
    while IFS= read -r file; do
      if [[ -z "${file}" ]]; then continue; fi
      if [[ "${DRY_RUN}" == "yes" ]]; then
        echo "would archive: ${file}"
      else
        mv -- "${file}" "${ARCHIVE_DIR}/"
        echo "archived: ${file}"
      fi
    done <<< "${STALE_ASSETS}"
  fi
fi

# ---------------------------------------------------------------------------
# Archive stale acceptance results (.forge/acceptance/*)
# ---------------------------------------------------------------------------

if [[ -d "${ACCEPTANCE_DIR}" ]]; then
  STALE_ACCEPTANCE=$(find "${ACCEPTANCE_DIR}" -mindepth 1 -maxdepth 1 -type d \
    -mtime "+${RETENTION_DAYS}" 2>/dev/null)
  if [[ -n "${STALE_ACCEPTANCE}" ]]; then
    if [[ "${DRY_RUN}" != "yes" ]]; then
      mkdir -p "${ACCEPTANCE_ARCHIVE}"
    fi
    while IFS= read -r dir; do
      if [[ -z "${dir}" ]]; then continue; fi
      if [[ "${DRY_RUN}" == "yes" ]]; then
        echo "would archive acceptance: ${dir}"
      else
        mv -- "${dir}" "${ACCEPTANCE_ARCHIVE}/"
        echo "archived acceptance: ${dir}"
      fi
    done <<< "${STALE_ACCEPTANCE}"
  fi
fi

exit 0
