#!/usr/bin/env bash
# category: user-facing
# install-template.sh — Install cmux.json workspace layout to project.
# Usage: install-template.sh [--force] [--no-cmux] [project_root]
#   --force    Overwrite existing cmux.json (shows diff first)
#   --no-cmux  Skip installation entirely
set -euo pipefail

FORGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="${FORGE_ROOT}/templates/cmux.json"

# Parse args
force=false
no_cmux=false
project_root="."

for arg in "$@"; do
  case "${arg}" in
    --force)    force=true ;;
    --no-cmux)  no_cmux=true ;;
    *)          project_root="${arg}" ;;
  esac
done

# --no-cmux: skip
if [[ "${no_cmux}" == "true" ]]; then
  exit 0
fi

TARGET="${project_root}/cmux.json"

# Template not found — nothing to install
if [[ ! -f "${TEMPLATE}" ]]; then
  exit 0
fi

# Target exists and no --force — skip (R9.5: idempotent)
if [[ -f "${TARGET}" && "${force}" != "true" ]]; then
  exit 0
fi

# --force: show diff before overwriting (R9.6)
if [[ -f "${TARGET}" && "${force}" == "true" ]]; then
  if command -v diff &>/dev/null; then
    diff "${TARGET}" "${TEMPLATE}" || true
  fi
fi

cp "${TEMPLATE}" "${TARGET}"
