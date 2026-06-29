#!/usr/bin/env bash
# category: user-facing
# ============================================================================
# forge dist-resync — Regenerate dist/ from src/ and stage changes for commit
#
# Usage:
#   bash scripts/dist-resync.sh [--yes] [--help]
#
# Options:
#   --yes    Skip interactive prompt and auto-stage changes
#   --help   Show this help message
# ============================================================================
set -euo pipefail

# No args + non-interactive → show help
if [ $# -eq 0 ] && [ ! -t 0 ]; then
  sed -n '4,/^# ===/p' "$0" | sed 's/^# //' | sed 's/^#//'
  exit 0
fi

AUTO_STAGE=""
for arg in "$@"; do
  case "$arg" in
    --yes) AUTO_STAGE=1 ;;
    --help|-h)
      sed -n '4,/^# ===/p' "$0" | sed 's/^# //' | sed 's/^#//'
      exit 0
      ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

echo "==> Cleaning stale compiled output + .tsbuildinfo cache..."
rm -rf dist/src dist/test dist/scripts
rm -f .tsbuildinfo tsconfig.tsbuildinfo

# Use tsconfig.build.json (excludes src/domain/** + test/**) so the in-repo
# domain reference code is NOT emitted to dist — matches build-dist.sh, ci.yml,
# and cross-version-check.yml (slice A INV-3 / domain-not-in-dist gate).
echo "==> Running tsc (tsconfig.build.json)..."
npx tsc -p tsconfig.build.json

echo "==> Checking dist/ changes..."
CHANGES=$(git status --porcelain dist/ || true)

if [ -z "$CHANGES" ]; then
  echo "dist-sync: No changes detected. dist/ is up to date."
  exit 0
fi

echo ""
echo "Changes in dist/:"
echo "$CHANGES" | while IFS= read -r line; do
  status="${line:0:2}"
  file="${line:3}"
  case "$status" in
    "??") echo "  [untracked] $file" ;;
    " M"|"M ") echo "  [modified]  $file" ;;
    " D"|"D ") echo "  [deleted]   $file" ;;
    "A ") echo "  [added]     $file" ;;
    *) echo "  [$status]   $file" ;;
  esac
done

UNTRACKED=$(echo "$CHANGES" | grep -c "^??" || true)
if [ "$UNTRACKED" -gt 0 ]; then
  echo ""
  echo "Note: $UNTRACKED untracked file(s) will be staged."
fi

if [ -n "$AUTO_STAGE" ]; then
  echo ""
  echo "==> Auto-staging dist/ changes..."
  git add dist/
elif [ ! -t 0 ]; then
  echo ""
  echo "Non-interactive mode. Changes left unstaged."
  echo "Re-run with --yes to auto-stage, or run interactively."
  exit 0
else
  echo ""
  read -r -p "Stage these changes? [y/N] " response
  if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
    git add dist/
  else
    echo "Changes left unstaged."
    exit 0
  fi
fi

echo ""
echo "Done. Commit with: git commit -m \"chore(dist): resync\""
