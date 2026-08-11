#!/usr/bin/env bash
set -uo pipefail
# category: user-facing
# ============================================================================
# prune-event-logs.sh — Remove expired forge-loop run directories.
#
# Reads `event_log_retention_days` from `.tinkerman/config.md` frontmatter
# (default: 30). Deletes any `.tinkerman/runs/<runId>/` directory whose mtime
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
  echo "Remove expired .tinkerman/runs/ directories based on retention config."
  echo "  --dry-run  Report what would be deleted without actually deleting"
  exit 0
elif [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="yes"
fi

CONFIG_FILE=".tinkerman/config.md"
RUNS_DIR=".tinkerman/runs"
ASSETS_DIR=".tinkerman/reviews/assets"
ARCHIVE_DIR=".tinkerman/archive/reviews"
ACCEPTANCE_DIR=".tinkerman/acceptance"
ACCEPTANCE_ARCHIVE=".tinkerman/archive/acceptance"

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
# Archive stale review assets (.tinkerman/reviews/assets/*)
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
# Archive stale acceptance results (.tinkerman/acceptance/*)
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

# ---------------------------------------------------------------------------
# Clean up stale cmux dedupe files (R6.4)
# ---------------------------------------------------------------------------

DEDUPE_DIR=".tinkerman/.cmux-dedupe"
if [[ -d "${DEDUPE_DIR}" ]]; then
  STALE_DEDUPE=$(find "${DEDUPE_DIR}" -type f -mmin +60 2>/dev/null)
  if [[ -n "${STALE_DEDUPE}" ]]; then
    while IFS= read -r file; do
      if [[ -z "${file}" ]]; then continue; fi
      if [[ "${DRY_RUN}" == "yes" ]]; then
        echo "would prune cmux-dedupe: ${file}"
      else
        rm -f -- "${file}"
      fi
    done <<< "${STALE_DEDUPE}"
  fi
fi

# ---------------------------------------------------------------------------
# Archive stale findings (.tinkerman/findings/*)
# ---------------------------------------------------------------------------

FINDINGS_RETENTION_DAYS=30
if [[ -f "${CONFIG_FILE}" ]]; then
  F_CONFIGURED=$(sed -n '/^---$/,/^---$/p' "${CONFIG_FILE}" 2>/dev/null \
    | (grep -E '^findings_retention_days:' || true) \
    | head -1 | sed 's/findings_retention_days:[[:space:]]*//' \
    | tr -d '[:space:]')
  if [[ -n "${F_CONFIGURED:-}" ]] && [[ "${F_CONFIGURED}" =~ ^[0-9]+$ ]]; then
    FINDINGS_RETENTION_DAYS="${F_CONFIGURED}"
  fi
fi

FINDINGS_DIR=".tinkerman/findings"
FINDINGS_ARCHIVE=".tinkerman/archive/findings"

if [[ -d "${FINDINGS_DIR}" ]]; then
  STALE_FINDINGS=$(find "${FINDINGS_DIR}" -type f -mtime "+${FINDINGS_RETENTION_DAYS}" 2>/dev/null || true)
  if [[ -n "${STALE_FINDINGS}" ]]; then
    if [[ "${DRY_RUN}" != "yes" ]]; then
      mkdir -p "${FINDINGS_ARCHIVE}"
    fi
    while IFS= read -r file; do
      [[ -z "${file}" ]] && continue
      if [[ "${DRY_RUN}" == "yes" ]]; then
        echo "would archive finding: ${file}"
      else
        mv -- "${file}" "${FINDINGS_ARCHIVE}/"
        echo "archived finding: ${file}"
      fi
    done <<< "${STALE_FINDINGS}"
  fi
fi

# Chain session-journal pruning (spec: session-journal-retention).
# prune-sessions.sh is a sibling script with the same --dry-run contract.
# Its own exit status is informational; we keep our exit 0 regardless, since
# the event-logs pruning above already succeeded.
CHAIN_FLAG=""
if [[ "${DRY_RUN}" == "yes" ]]; then
  CHAIN_FLAG="--dry-run"
fi
if [[ -f "scripts/prune-sessions.sh" ]]; then
  echo ""
  bash scripts/prune-sessions.sh ${CHAIN_FLAG} || true
fi

exit 0
