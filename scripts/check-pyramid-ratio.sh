#!/usr/bin/env bash
# category: user-facing
# Usage: check-pyramid-ratio.sh <spec-requirements.md>
#
# ADR-0006 Req7 gate: blocks spec lock / ship when E2E scenarios dominate and
# the cheap layers (unit/component/contract) are empty. Shares the isE2eHeavy
# judgement with aggregateVerdicts (Req5 signal) via scripts/check-pyramid-ratio.ts.
#
# Config (.forge/config.md):
#   e2e_ratio_threshold: 0.3   # max non-@critical e2e ratio (default 0.3)
#   strict_pyramid: true       # false → warn-only (never blocks)
#
# Exits 0 when healthy / skipped / warn-only; 1 when E2E-heavy (strict).
set -euo pipefail
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '4,21p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi
spec_file="${1:?Usage: check-pyramid-ratio.sh <spec-requirements.md>}"
[[ -f "$spec_file" ]] || { echo "ERROR: spec not found: $spec_file"; exit 1; }
script_dir="$(cd "$(dirname "$0")" && pwd)"
project_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
exec npx tsx "$script_dir/check-pyramid-ratio.ts" "$spec_file" "$project_root"
