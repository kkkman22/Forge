#!/usr/bin/env bash
set -euo pipefail

# Mark all locked specs predating contract validation as legacy
# Usage: mark-legacy-contracts.sh [specs-dir] [cutoff-date]
#   specs-dir defaults to .tinkerman/specs
#   cutoff-date defaults to today (YYYY-MM-DD)

specs_dir="${1:-.tinkerman/specs}"
cutoff_date="${2:-$(date +%Y-%m-%d)}"
marked=0

for spec in "$specs_dir"/*/spec.md; do
  [[ -f "$spec" ]] || continue
  # Already marked
  grep -q 'contract_legacy: true' "$spec" && continue
  # Must be locked
  grep -q 'status: locked' "$spec" || continue
  # Check lock_date
  lock_date=$(grep -oP 'locked:\s*"\K[^"]+' "$spec" 2>/dev/null || echo "")
  if [[ -z "$lock_date" || "$lock_date" < "$cutoff_date" ]]; then
    sed -i '' '/^status: locked$/a\
contract_legacy: true
' "$spec"
    echo "Marked: $spec (locked $lock_date)"
    ((marked++))
  fi
done

echo "Done: marked $marked specs as contract_legacy"
