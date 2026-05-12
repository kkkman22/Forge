#!/bin/bash
# category: internal-only
# Doc Link Checker — validates Markdown relative links point to existing files

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

# Find all .md files in docs/ and root
cd "$ROOT"
MD_FILES=$(find docs -name "*.md" 2>/dev/null; find . -maxdepth 1 -name "*.md" 2>/dev/null)

for FILE in $MD_FILES; do
  LINE_NUM=0
  while IFS= read -r LINE; do
    LINE_NUM=$((LINE_NUM + 1))
    # Extract markdown links [text](path) — skip URLs with :// (absolute)
    while IFS= read -r LINK; do
      [ -n "$LINK" ] || continue
      # Extract path from (path)
      PATH_PART=$(echo "$LINK" | sed -E 's/.*\]\(([^)]+)\).*/\1/')
      # Skip absolute URLs, anchors-only, mailto
      if [[ "$PATH_PART" =~ ^(https?|mailto|#) ]]; then
        continue
      fi
      # Remove anchor fragment
      TARGET="${PATH_PART%%#*}"
      # Skip if empty after removing anchor
      if [ -z "$TARGET" ]; then
        continue
      fi
      # Resolve relative to file's directory
      FILE_DIR=$(dirname "$FILE")
      if [ "$FILE_DIR" = "." ]; then
        FILE_DIR=""
      fi
      # Resolve path
      if [ -n "$FILE_DIR" ]; then
        RESOLVED="$FILE_DIR/$TARGET"
      else
        RESOLVED="$TARGET"
      fi
      # Normalize ./ and ../
      RESOLVED=$(cd "$ROOT" && realpath -m --relative-to="$ROOT" "$RESOLVED" 2>/dev/null || echo "$RESOLVED")
      # Check existence
      if [ ! -e "$RESOLVED" ]; then
        echo "[ERROR] $FILE:$LINE_NUM → $TARGET (file not found)"
        ERRORS=$((ERRORS + 1))
      fi
    done < <(echo "$LINE" | grep -oE '\[([^]]+)\]\(([^)]+)\)' || true)
  done < "$FILE"
done

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "$ERRORS broken link(s) found."
  exit 1
fi

echo "All links valid."
exit 0
