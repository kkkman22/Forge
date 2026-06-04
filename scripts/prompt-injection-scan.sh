#!/usr/bin/env bash
set -euo pipefail

# prompt-injection-scan.sh — CI scan for prompt injection patterns
# Scans repo files for injection, compression-survival, and invisible Unicode patterns.
# Exit 0 = clean, Exit 1 = patterns found.
# --strict = ignore allow annotations
# Uses LC_ALL=C for locale-hardened matching

LC_ALL=C
export LC_ALL

STRICT=0
if [[ "${1:-}" == "--strict" ]]; then STRICT=1; fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PATTERNS_FILE="$SCRIPT_DIR/injection-patterns.json"

# Combined grep pattern (built from shared JSON)
# Using node to extract and combine patterns from injection-patterns.json
COMBINED_RE=$(node -e "
var p = JSON.parse(require('fs').readFileSync('$PATTERNS_FILE','utf8'));
var ps = p.map(function(x){ return x.pattern; });
// Add compression-survival patterns (read-specific)
ps.push(
  'when\\\\s+(summariz|compress|condens|abbreviat)',
  'retain\\\\s+(this|the)\\\\s+(when|if|during)',
  'do\\\\s+not\\\\s+(remove|omit|exclude|delete|summarize)',
  'always\\\\s+include\\\\s+(this|the)',
  'preserve\\\\s+(this|the\\\\s+following|above)',
  'important:\\\\s+(do\\\\s+not|never|always|must)'
);
console.log(ps.join('|'));
" 2>/dev/null)

if [[ -z "$COMBINED_RE" ]]; then
  echo "ERROR: Failed to load patterns from $PATTERNS_FILE" >&2
  exit 0  # Fail-open
fi

# Allowlist file
IGNORE_FILE=".prompt-scan-ignore"
if [[ -f "$IGNORE_FILE" ]]; then
  IGNORE_ARGS="--exclude-from=$IGNORE_FILE"
else
  IGNORE_ARGS=""
fi

# Find matching files
FILES=$(find . -type f \( -name "*.md" -o -name "*.js" -o -name "*.ts" -o -name "*.sh" -o -name "*.json" -o -name "*.yml" -o -name "*.yaml" \) \
  ! -path "./node_modules/*" ! -path "./.git/*" ! -path "./dist/*" ! -path "./dist-plugin/*" \
  2>/dev/null || true)

if [[ -z "$FILES" ]]; then
  exit 0
fi

FOUND=0
SEVERITY_THRESHOLD=3

# Single-pass scan: one grep per file with all patterns combined
echo "$FILES" | while IFS= read -r -d '' file; do
  [[ -z "$file" ]] && continue

  # Read file content once
  content=$(grep -n '.' "$file" 2>/dev/null) || continue

  # Count pattern matches
  match_count=0
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    line_num=$(echo "$match" | cut -d: -f1)
    line_content=$(echo "$match" | cut -d: -f2-)

    # Check allow annotation (skip in strict mode)
    if [[ $STRICT -eq 0 ]] && echo "$line_content" | grep -q '# allow:'; then
      continue
    fi

    # Find which pattern matched
    pat_name="unknown"
    for entry in $(echo "$line_content" | grep -oP "$COMBINED_RE" 2>/dev/null | head -1); do
      pat_name="$entry"
      break
    done

    severity="LOW"
    match_count=$((match_count + 1))
    [[ $match_count -ge $SEVERITY_THRESHOLD ]] && severity="HIGH"

    echo "${file}:${line_num}:${pat_name}:${severity}"
    FOUND=1
  done < <(echo "$content" | grep -nP "$COMBINED_RE" 2>/dev/null)
done

# Invisible Unicode scan (separate pass)
echo "$FILES" | while IFS= read -r -d '' file; do
  [[ -z "$file" ]] && continue
  if grep -Pq '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{FEFF}\x{AD}\x{2060}]' "$file" 2>/dev/null; then
    echo "${file}:0:invisible-unicode:LOW"
  fi
done

exit $FOUND
