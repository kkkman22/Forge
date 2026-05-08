#!/bin/bash
# check-no-execsync.sh — Prevent execSync usage in src/
# All shell command execution must use execFileSync for argument safety.
set -euo pipefail

matches=$(grep -rn "\bexecSync\b" src/ 2>/dev/null | grep -v "biome-ignore" || true)
if [ -n "$matches" ]; then
  echo "::error::execSync usage found in src/ (use execFileSync instead):"
  echo "$matches"
  exit 1
fi

echo "OK: No execSync usage in src/"
exit 0
