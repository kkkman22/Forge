#!/bin/bash
# check-no-bare-console.sh — CI gate that ensures no bare console.* calls
# remain in src/ (outside of test/). Only biome-ignore-guarded calls are allowed.
#
# Exits 0 if clean, exits 1 with a list of violations.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

# Find console.log / console.warn / console.error / console.info / console.debug
# in src/ files, excluding the ConsoleSink module and biome-ignore-guarded calls.
# A call is considered guarded if the line itself or the preceding line contains
# biome-ignore.
violations=""

# Get all console.* call locations
console_calls=$(grep -rn 'console\.\(log\|warn\|error\|info\|debug\)' src/ \
  | grep -v 'console-sink\.ts' \
  | grep -v '/\*.*biome-ignore' \
  || true)

# For each call, check if the previous line has a biome-ignore comment
if [ -n "$console_calls" ]; then
  while IFS= read -r line; do
    file=$(echo "$line" | cut -d: -f1)
    linenum=$(echo "$line" | cut -d: -f2)

    # Check if current line has biome-ignore inline
    if echo "$line" | grep -q 'biome-ignore'; then
      continue
    fi

    # Check if the preceding line has biome-ignore
    if [ "$linenum" -gt 1 ]; then
      prevline=$(sed -n "$((linenum - 1))p" "$file" 2>/dev/null || true)
      if echo "$prevline" | grep -q 'biome-ignore'; then
        continue
      fi
    fi

    # Check if this is just a text reference to console.* (in comments/docs)
    # Match patterns like: " * text" or " // text" or "/* text"
    content=$(echo "$line" | sed 's/^[^:]*:[0-9]*://')
    if echo "$content" | grep -qE '^\s*(//|\*|/\*|\*\*)' ; then
      continue
    fi

    violations="${violations}${line}"$'\n'
  done <<< "$console_calls"
fi

if [ -n "$violations" ]; then
  echo "❌ Bare console.* calls found in src/ (not guarded by biome-ignore):" >&2
  echo "$violations" >&2
  echo "" >&2
  echo "ConsoleSink (src/logger/console-sink.ts) is the single exit point." >&2
  echo "Either migrate to ConsoleSink or add a biome-ignore comment." >&2
  exit 1
fi

echo "✅ No bare console.* calls in src/"
exit 0
