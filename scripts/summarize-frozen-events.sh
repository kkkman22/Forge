#!/usr/bin/env bash
# category: internal-only
# summarize-frozen-events.sh — Summarize frozen-zone audit events for /tinkerman status.
#
# Usage: bash scripts/summarize-frozen-events.sh [--days=N]
#
# Reads .forge/runs/*-frozen-events.jsonl and outputs a compact summary.
set -euo pipefail

DAYS="${1:---days=7}"
if [[ "$DAYS" == --days=* ]]; then
  DAYS="${DAYS#--days=}"
else
  DAYS=7
fi

runs_dir=""
for candidate in ".forge/runs" "forge/.forge/runs"; do
  if [[ -d "$candidate" ]]; then
    runs_dir="$candidate"
    break
  fi
done

if [[ -z "$runs_dir" ]]; then
  echo "Frozen-zone: no audit logs found."
  exit 0
fi

# Calculate cutoff date (BSD/GNU date compatibility).
cutoff=$(date -u -v-${DAYS}d +%Y-%m-%d 2>/dev/null || date -u -d "${DAYS} days ago" +%Y-%m-%d 2>/dev/null || echo "")

# Aggregate categories with a single awk pass over all log files.
# Avoids per-line fork chains (printf|grep|head|cut) that dominated runtime.
result=$(
  shopt -s nullglob
  files=("${runs_dir}"/*-frozen-events.jsonl)
  if [[ ${#files[@]} -eq 0 ]]; then
    echo ""
    exit 0
  fi
  awk -v cutoff="$cutoff" '
    {
      # Extract timestamp date prefix (first 10 chars after "timestamp":")
      ts = ""
      if (match($0, /"timestamp":"[0-9]{4}-[0-9]{2}-[0-9]{2}/)) {
        ts = substr($0, RSTART + 13, 10)
      }
      if (cutoff != "" && ts != "" && ts < cutoff) next

      # Extract category value
      cat = "unknown"
      if (match($0, /"category":"[^"]*"/)) {
        cat = substr($0, RSTART + 12, RLENGTH - 13)
      }
      counts[cat]++
    }
    END {
      for (c in counts) printf "%d\t%s\n", counts[c], c
    }
  ' "${files[@]}" \
    | sort -rn -k1,1
)

if [[ -z "$result" ]]; then
  echo "Frozen-zone: 0 hits in last ${DAYS} days."
  exit 0
fi

total=$(printf '%s\n' "$result" | awk '{s+=$1} END {print s}')
echo "Frozen-zone: ${total} hits in last ${DAYS} days"

# Output is already "<count>\t<category>" — render as "  category: count".
printf '%s\n' "$result" | awk -F'\t' '{ printf "  %s: %d\n", $2, $1 }'

echo "  See ${runs_dir}/ for full log."
