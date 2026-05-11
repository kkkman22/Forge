#!/usr/bin/env bash
# category: internal-only
# print-zone-registry.sh — Debug tool: output flat list of zone rules.
#
# Usage: bash scripts/print-zone-registry.sh [--json]
#
# Output format (default):
#   <path-glob>  <category>  <reason_code>
#
# Output format (--json):
#   JSON array of rule objects
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
source "${script_dir}/zone-registry.sh"

json_mode=false
[[ "${1:-}" == "--json" ]] && json_mode=true

rules=$(parse_zone_registry)

if $json_mode; then
  echo "["
  first=true
  while IFS=$'\t' read -r glob category reason_code qualifier; do
    [[ -z "$glob" ]] && continue
    $first || echo ","
    printf '  {"glob":"%s","category":"%s","reason_code":"%s","qualifier":"%s"}' \
      "$glob" "$category" "$reason_code" "${qualifier:-}"
    first=false
  done <<< "$rules"
  echo ""
  echo "]"
else
  printf '%-35s %-22s %s\n' "PATH_GLOB" "CATEGORY" "REASON_CODE"
  while IFS=$'\t' read -r glob category reason_code qualifier; do
    [[ -z "$glob" ]] && continue
    printf '%-35s %-22s %s\n' "$glob" "$category" "$reason_code"
  done <<< "$rules"
fi
