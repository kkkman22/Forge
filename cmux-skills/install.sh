#!/usr/bin/env bash
# category: user-facing
# install.sh — Install or uninstall optional cmux Forge skills.
# Usage: install.sh [--dry-run|--apply|--uninstall] [target_dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS=(forge-sidebar-sync forge-browser-qa forge-loop-signals)

# ---------- --help ----------
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: cmux-skills/install.sh [OPTION] [TARGET_DIR]"
  echo ""
  echo "Manage optional cmux Forge skill bundles."
  echo ""
  echo "Options:"
  echo "  --dry-run     List skills that would be installed (default)"
  echo "  --apply       Copy skill directories to TARGET_DIR"
  echo "  --uninstall   Remove skill directories from TARGET_DIR"
  echo "  --help        Show this help"
  echo ""
  echo "Default TARGET_DIR is .claude/skills/"
  exit 0
fi

# Parse args
mode="dry-run"
target=""

for arg in "$@"; do
  case "${arg}" in
    --dry-run)   mode="dry-run" ;;
    --apply)     mode="apply" ;;
    --uninstall) mode="uninstall" ;;
    *)           target="${arg}" ;;
  esac
done

target="${target:-.claude/skills}"

# Validate target path — reject traversal
if [[ "$target" =~ \.\. ]]; then
  echo "install.sh: invalid target path" >&2
  exit 1
fi

case "${mode}" in
  dry-run)
    for skill in "${SKILLS[@]}"; do
      echo "${skill}"
    done
    ;;
  apply)
    mkdir -p "${target}"
    for skill in "${SKILLS[@]}"; do
      mkdir -p "${target}/${skill}"
      cp "${SCRIPT_DIR}/${skill}/SKILL.md" "${target}/${skill}/SKILL.md"
    done
    ;;
  uninstall)
    for skill in "${SKILLS[@]}"; do
      rm -rf "${target}/${skill}"
    done
    ;;
esac
