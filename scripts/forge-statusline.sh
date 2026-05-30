#!/usr/bin/env bash
# category: internal
# ============================================================================
# forge-statusline.sh — Claude Code Status Line data source
#
# Reads .forge/status.md and .forge/progress/ to produce a one-line
# status string for the Claude Code terminal status bar.
#
# Output format:
#   Forge: <phase> [completed/total tasks]
#   Forge: idle (when no active task)
#
# Usage:
#   bash scripts/forge-statusline.sh
#
# Exit: always 0 (fail-open)
# ============================================================================

set -euo pipefail

# Guard: no .forge directory
if [[ ! -f .forge/status.md ]]; then
  echo "Forge: idle"
  exit 0
fi

# Extract phase from YAML frontmatter
phase=$(awk '/^phase:/{gsub(/"/,""); print $2; exit}' .forge/status.md 2>/dev/null || true)
task=$(awk '/^current_task:/{gsub(/"/,""); $1=""; print; exit}' .forge/status.md 2>/dev/null | xargs || true)

# No active task
if [[ -z "${task}" ]]; then
  echo "Forge: idle"
  exit 0
fi

# Sanitize task name: only allow alphanumeric, hyphens, underscores (prevent path traversal)
if [[ ! "${task}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Forge: idle"
  exit 0
fi

# Count progress from .forge/progress/
completed=0
total=0
if [[ -f .forge/progress/"${task}".md ]]; then
  total=$(grep -cE '^\s*- \[' .forge/progress/"${task}".md 2>/dev/null || echo 0)
  completed=$(grep -cE '^\s*- \[x\]' .forge/progress/"${task}".md 2>/dev/null || echo 0)
fi

# Format output
if [[ "${total}" -gt 0 ]]; then
  echo "Forge: ${phase:-build} [${completed}/${total}] ${task}"
else
  echo "Forge: ${phase:-build} | ${task}"
fi
