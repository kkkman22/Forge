#!/usr/bin/env bash
# check-iron-laws.sh — Verify all <IRON-LAW> and <HARD-GATE> name attributes are unique.
# Exits 0 if all unique, exits 1 if duplicates found.

set -euo pipefail

# Extract all name attributes from <IRON-LAW name="..."> and <HARD-GATE name="...">
names=$(rg -o '<(IRON-LAW|HARD-GATE) name="[^"]*"' --no-filename -g '!templates/**' . \
  | sed 's/<\(IRON-LAW\|HARD-GATE\) name="//;s/"$//')

if [ -z "$names" ]; then
  echo "No IRON-LAW or HARD-GATE name attributes found."
  exit 0
fi

duplicates=$(echo "$names" | sort | uniq -d)

if [ -z "$duplicates" ]; then
  count=$(echo "$names" | wc -l | tr -d ' ')
  echo "All $count name attributes are unique."
  exit 0
else
  echo "ERROR: Duplicate name attributes found:"
  echo "$duplicates"
  exit 1
fi
