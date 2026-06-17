#!/usr/bin/env bash
# category: user-facing
# ============================================================================
# prune-sessions.sh — Remove expired .forge/knowledge/sessions/*.md journals.
#
# Reads `session_retention_days` (default: 90) and `session_keep_recent`
# (default: 5) from `.forge/config.md` frontmatter.
#
# A session journal is pruned when BOTH conditions hold:
#   1. Its mtime is older than `session_retention_days`, AND
#   2. It is NOT protected.
#
# Protection set (never pruned regardless of age):
#   - The `session_keep_recent` newest journals by mtime.
#   - Any journal referenced via `source_session:` in
#     `.forge/knowledge/solutions/*.md` (currently a best-effort grep;
#     solutions/ does not yet populate this field, so the set is empty
#     today but the logic is forward-compatible).
#
# Usage:
#   bash scripts/prune-sessions.sh            # normal run
#   bash scripts/prune-sessions.sh --dry-run  # report only, no deletion
#
# Exit codes:
#   0 — success (including "nothing to prune")
#   1 — configuration or I/O error
# ============================================================================

set -euo pipefail

DRY_RUN="no"
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: scripts/prune-sessions.sh [--dry-run]"
  echo ""
  echo "Remove expired .forge/knowledge/sessions/*.md journals based on retention config."
  echo "Protected: newest N journals + any referenced by solutions/."
  echo "  --dry-run  Report what would be deleted without actually deleting"
  exit 0
elif [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="yes"
fi

CONFIG_FILE=".forge/config.md"
SESSIONS_DIR=".forge/knowledge/sessions"
SOLUTIONS_DIR=".forge/knowledge/solutions"

# Defaults, overridden by config when present.
RETENTION_DAYS=90
KEEP_RECENT=5

# ---------------------------------------------------------------------------
# Read config from frontmatter (mirrors prune-event-logs.sh parsing style)
# ---------------------------------------------------------------------------

read_config_field() {
  local field="$1"
  sed -n '/^---$/,/^---$/p' "${CONFIG_FILE}" 2>/dev/null \
    | (grep -E "^${field}:" || true) \
    | head -1 \
    | sed "s/${field}:[[:space:]]*//" \
    | tr -d '[:space:]'
}

if [[ -f "${CONFIG_FILE}" ]]; then
  CFG_RETENTION=$(read_config_field "session_retention_days")
  if [[ -n "${CFG_RETENTION:-}" ]] && [[ "${CFG_RETENTION}" =~ ^[0-9]+$ ]] && [[ "${CFG_RETENTION}" -gt 0 ]]; then
    RETENTION_DAYS="${CFG_RETENTION}"
  elif [[ -n "${CFG_RETENTION:-}" ]]; then
    echo "prune-sessions: invalid session_retention_days='${CFG_RETENTION}', using default ${RETENTION_DAYS}" >&2
  fi

  CFG_KEEP=$(read_config_field "session_keep_recent")
  if [[ -n "${CFG_KEEP:-}" ]] && [[ "${CFG_KEEP}" =~ ^[0-9]+$ ]] && [[ "${CFG_KEEP}" -gt 0 ]]; then
    KEEP_RECENT="${CFG_KEEP}"
  elif [[ -n "${CFG_KEEP:-}" ]]; then
    echo "prune-sessions: invalid session_keep_recent='${CFG_KEEP}', using default ${KEEP_RECENT}" >&2
  fi
fi

# ---------------------------------------------------------------------------
# Early exit when there is nothing to prune
# ---------------------------------------------------------------------------

if [[ ! -d "${SESSIONS_DIR}" ]]; then
  echo "No ${SESSIONS_DIR} directory found — nothing to prune."
  exit 0
fi

# Collect .md journals (guard against empty glob).
JOURNALS=()
while IFS= read -r -d '' f; do
  JOURNALS+=("$f")
done < <(find "${SESSIONS_DIR}" -maxdepth 1 -type f -name '*.md' -print0 2>/dev/null)

if [[ ${#JOURNALS[@]} -eq 0 ]]; then
  echo "No session journals in ${SESSIONS_DIR} — nothing to prune."
  exit 0
fi

echo "prune-sessions: retention=${RETENTION_DAYS} days, keep_recent=${KEEP_RECENT}, dry_run=${DRY_RUN}"

# ---------------------------------------------------------------------------
# Build the protection set (bash 3.2 compatible — no associative arrays).
# PROTECTED_FILE holds one absolute path per line; membership is tested with
# `grep -xF` (fixed-string, whole-line match).
# ---------------------------------------------------------------------------

PROTECTED_FILE="$(mktemp)"
trap 'rm -f -- "${PROTECTED_FILE}"' EXIT

# Protection 1: newest N journals by mtime (most recent first).
# `ls -t` sorts by mtime descending; session filenames contain no spaces.
ls -t "${JOURNALS[@]}" 2>/dev/null | head -n "${KEEP_RECENT}" > "${PROTECTED_FILE}"

# Protection 2: journals referenced by solutions/ via `source_session:`.
# Best-effort grep — solutions/ does not currently populate this field, so the
# set is typically empty; logic is kept for forward compatibility.
if [[ -d "${SOLUTIONS_DIR}" ]]; then
  REFERENCED=$(grep -rhE '^source_session:' "${SOLUTIONS_DIR}"/*.md 2>/dev/null \
    | sed 's/source_session:[[:space:]]*//' \
    | tr -d '[:space:]"' \
    | sort -u || true)
  if [[ -n "${REFERENCED:-}" ]]; then
    while IFS= read -r ref; do
      [[ -z "${ref:-}" ]] && continue
      # source_session stores a filename (glossary.ts:57); resolve to full path.
      candidate="${SESSIONS_DIR}/${ref}"
      # Accept both bare name and name already ending in .md.
      if [[ -f "${candidate}" ]]; then
        echo "${candidate}" >> "${PROTECTED_FILE}"
      elif [[ -f "${candidate}.md" ]]; then
        echo "${candidate}.md" >> "${PROTECTED_FILE}"
      fi
    done <<< "${REFERENCED}"
  fi
fi

# is_protected <path>: returns 0 (true) if <path> is in the protection set.
is_protected() {
  grep -xF -- "$1" "${PROTECTED_FILE}" >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# Find expired journals and prune (respecting protection)
# ---------------------------------------------------------------------------

# Candidate set: journals older than RETENTION_DAYS.
STALE=$(find "${SESSIONS_DIR}" -maxdepth 1 -type f -name '*.md' -mtime "+${RETENTION_DAYS}" 2>/dev/null || true)

PRUNED_COUNT=0
PROTECTED_HIT_COUNT=0
FAILED=0

while IFS= read -r journal; do
  [[ -z "${journal:-}" ]] && continue

  if is_protected "${journal}"; then
    if [[ "${DRY_RUN}" == "yes" ]]; then
      echo "would keep [protected]: ${journal}"
    fi
    PROTECTED_HIT_COUNT=$((PROTECTED_HIT_COUNT + 1))
    continue
  fi

  if [[ "${DRY_RUN}" == "yes" ]]; then
    echo "would prune: ${journal}"
  else
    if rm -f -- "${journal}" 2>/dev/null; then
      echo "pruned: ${journal}"
    else
      echo "prune-sessions: failed to remove ${journal}" >&2
      FAILED=1
      continue
    fi
  fi
  PRUNED_COUNT=$((PRUNED_COUNT + 1))
done <<< "${STALE}"

echo "prune-sessions: pruned=${PRUNED_COUNT}, protected_hits=${PROTECTED_HIT_COUNT}"

# ---------------------------------------------------------------------------
# Append a summary line to tool-health.md (best-effort, never fatal)
# ---------------------------------------------------------------------------

HEALTH_FILE=".forge/knowledge/tool-health.md"
SUMMARY="prune-sessions: $(date -u +%Y-%m-%dT%H:%M:%SZ) pruned=${PRUNED_COUNT} protected_hits=${PROTECTED_HIT_COUNT} retention_days=${RETENTION_DAYS} keep_recent=${KEEP_RECENT} dry_run=${DRY_RUN}"
if [[ "${DRY_RUN}" != "yes" ]]; then
  mkdir -p "$(dirname "${HEALTH_FILE}")" 2>/dev/null || true
  echo "${SUMMARY}" >> "${HEALTH_FILE}" 2>/dev/null || true
fi

exit "${FAILED}"
