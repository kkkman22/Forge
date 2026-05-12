#!/bin/bash
# category: internal-only
# Doc Structure Validator — checks navigation links and cross-references

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

cd "$ROOT"

# Check 1: each docs/*.md first line contains return-to-index link
for FILE in docs/*.md; do
  [ -e "$FILE" ] || continue
  FIRST_LINE=$(head -n 1 "$FILE")
  if ! echo "$FIRST_LINE" | grep -qE '\(./INDEX'; then
    echo "[ERROR] $FILE: first line missing return-to-index link"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check 2: *.en.md files contain Chinese version link
for FILE in docs/*.en.md; do
  [ -e "$FILE" ] || continue
  if ! grep -qE '\(./[^)]+\.md\)' "$FILE"; then
    echo "[ERROR] $FILE: missing Chinese version link"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check 3: Chinese docs with English version contain English link
for FILE in docs/*.md; do
  [ -e "$FILE" ] || continue
  # Skip INDEX.md (special case, links to INDEX.en.md)
  BASENAME=$(basename "$FILE" .md)
  if [ "$BASENAME" = "INDEX" ]; then
    if [ -e "docs/INDEX.en.md" ]; then
      if ! grep -qE '\(./INDEX\.en\.md\)' "$FILE"; then
        echo "[ERROR] $FILE: missing English version link"
        ERRORS=$((ERRORS + 1))
      fi
    fi
    continue
  fi
  EN_FILE="docs/${BASENAME}.en.md"
  if [ -e "$EN_FILE" ]; then
    if ! grep -qE "\(./${BASENAME}\.en\.md\)" "$FILE"; then
      echo "[ERROR] $FILE: missing English version link"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

# Check 4: INDEX.md contains all docs entries
if [ -e "docs/INDEX.md" ]; then
  for FILE in docs/*.md; do
    [ -e "$FILE" ] || continue
    BASENAME=$(basename "$FILE")
    # Skip INDEX itself
    if [ "$BASENAME" = "INDEX.md" ]; then
      continue
    fi
    if ! grep -qF "$BASENAME" "docs/INDEX.md"; then
      echo "[ERROR] docs/INDEX.md: missing entry for $BASENAME"
      ERRORS=$((ERRORS + 1))
    fi
  done
fi

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "$ERRORS structure issue(s) found."
  exit 1
fi

echo "All structure checks passed."
exit 0
