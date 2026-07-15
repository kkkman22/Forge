#!/usr/bin/env bash
# category: internal-only
# check-iron-law-name-uniqueness.sh — verify all <IRON-LAW> and <HARD-GATE> name
# attributes are unique across the repo. Renamed from check-iron-laws.sh (audit
# P2: the old name implied behavioral enforcement; this only checks name
# uniqueness — wired into the check chain now).
#
# Exits 0 if all unique, exits 1 if duplicates found.

set -euo pipefail

# Extract ONLY the name attribute value from every IRON-LAW / HARD-GATE tag.
# grep -h suppresses filenames; the regex captures name="..." content.
names=$(grep -rhoE '<(IRON-LAW|HARD-GATE) name="[^"]*"' --include='*.md' --exclude-dir=templates . \
  | sed -E 's/.*name="//;s/"$//')

if [ -z "$names" ]; then
  echo "No IRON-LAW or HARD-GATE name attributes found."
  exit 0
fi

duplicates=$(echo "$names" | sort | uniq -d)

if [ -z "$duplicates" ]; then
  count=$(echo "$names" | wc -l | tr -d ' ')
  echo "All $count IRON-LAW/HARD-GATE name attributes are unique."
  exit 0
else
  echo "ERROR: Duplicate IRON-LAW/HARD-GATE name attributes found:"
  echo "$duplicates"
  exit 1
fi
