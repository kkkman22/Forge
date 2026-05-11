#!/usr/bin/env bash
# category: internal-only
# summarize-frozen-events.sh — Summarize frozen-zone audit events for /forge status.
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

# Calculate cutoff date
cutoff=$(date -u -v-${DAYS}d +%Y-%m-%d 2>/dev/null || date -u -d "${DAYS} days ago" +%Y-%m-%d 2>/dev/null || echo "")

# Collect relevant log lines and aggregate
result=$(cat "${runs_dir}"/*-frozen-events.jsonl 2>/dev/null | while IFS= read -r line; do
  [[ -z "$line" ]] && continue

  # Extract date from timestamp
  ts=$(printf '%s' "$line" | grep -oE '"timestamp":"[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1 | cut -d'"' -f4) || continue
  [[ -n "$cutoff" ]] && [[ "$ts" < "$cutoff" ]] && continue

  category=$(printf '%s' "$line" | grep -oE '"category":"[^"]*"' | head -1 | cut -d'"' -f4) || category="unknown"

  printf '%s\n' "$category"
done | sort | uniq -c | sort -rn)

if [[ -z "$result" ]]; then
  echo "Frozen-zone: 0 hits in last ${DAYS} days."
  exit 0
fi

total=$(printf '%s\n' "$result" | awk '{s+=$1} END {print s}')
echo "Frozen-zone: ${total} hits in last ${DAYS} days"

printf '%s\n' "$result" | while read -r count category; do
  echo "  ${category}: ${count}"
done

echo "  See ${runs_dir}/ for full log."
