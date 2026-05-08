#!/bin/bash
# ============================================================================
# validate-skill-skeleton.sh — SKILL.md section skeleton validator
#
# Thin wrapper: invokes node to run validate-skill-skeleton.mjs.
# ============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/validate-skill-skeleton.mjs" "$@"
