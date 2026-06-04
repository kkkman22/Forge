#!/usr/bin/env bash
# prompt-injection-scan.sh — CI scan for prompt injection patterns
#
# Scans repo files for injection patterns. Supports .prompt-scan-ignore
# exclusions and inline # allow: reason="..." owner="..." expires="YYYY-MM-DD"
# annotations.
#
# Usage: ./scripts/prompt-injection-scan.sh [--strict]
#   --strict  Ignore allow annotations (for release CI)
#
# Exit codes: 0 = pass, 1 = found injection patterns
set -euo pipefail

# Locale-hardened pattern matching
export LC_ALL=C

STRICT=false
if [[ "${1:-}" == "--strict" ]]; then
  STRICT=true
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IGNORE_FILE="$REPO_ROOT/.prompt-scan-ignore"

# Injection patterns as grep -P regexps
# Each line: pattern_name\tperl_regex
PATTERNS=(
  $'instruction-override\tignore\\s+(previous|all|above|earlier)\\s+instructions?'
  $'disregard-instructions\tdisregard\\s+(previous|above)\\s+(instructions?|rules)'
  $'forget-all\tforget\\s+(everything|all)'
  $'role-manipulation\tyou\\s+are\\s+now\\s+a'
  $'new-instructions\tnew\\s+instructions?:'
  $'your-role\tyour\\s+(new\\s+)?role\\s+(is|should\\s+be)'
  $'system-tag\t<(system|assistant|human|user)>|\\[SYSTEM\\]|\\[INST\\]|<<SYS>>|<\\|im_start\\|>'
  $'html-comment-tag\t<!--\\s*(system|assistant)'
  $'tool-call-injection\tuse\\s+(the\\s+)?(Read|Write|Edit|Bash)\\s+tool'
  $'call-function\tcall\\s+(the\\s+)?function'
  $'execute-command\texecute\\s+(the\\s+)?(following\\s+)?command'
  $'dan-mode\tDAN\\s+(mode|jailbreak)'
  $'developer-mode\tdeveloper\\s+mode'
  $'bypass-restrictions\tbypass\\s+(your|the)\\s+(restrictions|rules|guidelines)'
)

# Compression-survival patterns
COMPRESSION_PATTERNS=(
  $'compression-when\twhen\\s+(summariz|compress|condens|abbreviat)'
  $'retain-when\tretain\\s+(this|the\\s+following|above)\\s+(when|if|during)'
  $'do-not-remove\tdo\\s+not\\s+(remove|omit|exclude|delete|summarize)'
  $'always-include\talways\\s+include\\s+(this|the|in)'
  $'preserve-this\tpreserve\\s+(this|the\\s+following|above)'
  $'important-directive\timportant:\\s+(do\\s+not|never|always|must)'
  $'critical-essential\tthis\\s+(is|must\\s+be)\\s+(critical|essential|required|mandatory)'
)

# Combine all patterns
ALL_PATTERNS=("${PATTERNS[@]}" "${COMPRESSION_PATTERNS[@]}")

# Build ignore list
declare -A IGNORE_MAP
if [[ -f "$IGNORE_FILE" ]]; then
  while IFS= read -r line; do
    # Skip comments and blank lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue
    IGNORE_MAP["$line"]=1
  done < "$IGNORE_FILE"
fi

# Find files to scan
FILES=$(find "$REPO_ROOT" \
  \( -name .git -o -name node_modules -o -name .claude \) -prune -o \
  \( -name '*.md' -o -name '*.js' -o -name '*.ts' -o -name '*.sh' -o -name '*.json' -o -name '*.yml' -o -name '*.yaml' \) \
  -print 2>/dev/null || true)

FOUND=0
RESULTS=()

# Create temp file for file list
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT
echo "$FILES" > "$TMPFILE"

while IFS= read -r -d '' file; do
  [[ -z "$file" ]] && continue

  # Check ignore list (relative path from repo root)
  rel_path="${file#$REPO_ROOT/}"
  if [[ -n "${IGNORE_MAP[$rel_path]+x}" ]]; then
    continue
  fi

  [[ ! -f "$file" ]] && continue

  while IFS= read -r line_content; do
    [[ -z "$line_content" ]] && continue

    line_num=$(echo "$line_content" | cut -f1)
    content=$(echo "$line_content" | cut -f2-)

    # Check for inline allow annotation
    if [[ "$STRICT" != "true" ]]; then
      if echo "$content" | grep -qP '#\s*allow:\s*reason='; then
        continue
      fi
    fi

    for pattern_entry in "${ALL_PATTERNS[@]}"; do
      pattern_name=$(echo "$pattern_entry" | cut -f1)
      pattern_re=$(echo "$pattern_entry" | cut -f2-)

      if echo "$content" | grep -qP "$pattern_re"; then
        SEVERITY="LOW"
        RESULT="${rel_path}:${line_num}:${pattern_name}:${SEVERITY}"
        RESULTS+=("$RESULT")
        FOUND=1
      fi
    done

  done < <(grep -n '.' "$file" 2>/dev/null || true)
done < <(tr '\n' '\0' < "$TMPFILE")

# Invisible Unicode scan (separate pass since grep -P can't handle these ranges easily)
while IFS= read -r -d '' file; do
  [[ -z "$file" ]] && continue
  rel_path="${file#$REPO_ROOT/}"

  if [[ -n "${IGNORE_MAP[$rel_path]+x}" ]]; then
    continue
  fi

  [[ ! -f "$file" ]] && continue

  # Scan for invisible Unicode characters using grep -P with hex patterns
  # U+200B-200F, U+202A-202E, U+FEFF, U+00AD, U+2060
  while IFS=: read -r line_num match_text; do
    [[ -z "$line_num" ]] && continue
    SEVERITY="LOW"
    RESULT="${rel_path}:${line_num}:invisible-unicode:${SEVERITY}"
    RESULTS+=("$RESULT")
    FOUND=1
  done < <(grep -nP '[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{FEFF}\x{AD}\x{2060}]' "$file" 2>/dev/null || true)

  # Unicode tag block U+E0000-E007F (UTF-8: F3 A0 80 80 through F3 A0 81 BF)
  while IFS=: read -r line_num match_text; do
    [[ -z "$line_num" ]] && continue
    SEVERITY="LOW"
    RESULT="${rel_path}:${line_num}:invisible-unicode-tag-block:${SEVERITY}"
    RESULTS+=("$RESULT")
    FOUND=1
  done < <(grep -nP '\xF3\xA0[\x80-\x81][\x80-\xBF]' "$file" 2>/dev/null || true)

done < <(tr '\n' '\0' < "$TMPFILE")

# Deduplicate results
if [[ ${#RESULTS[@]} -gt 0 ]]; then
  printf '%s\n' "${RESULTS[@]}" | sort -u
fi

if [[ "$FOUND" -eq 1 ]]; then
  exit 1
fi

exit 0
