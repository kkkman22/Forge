#!/usr/bin/env bash
set -euo pipefail
# run-ci-ultrareview.sh — Wrapper for claude ultrareview --json with Forge conventions
#
# Usage: scripts/run-ci-ultrareview.sh <pr-number-or-url>
# Env:
#   ANTHROPIC_API_KEY          (required by claude CLI)
#   CI_ULTRAREVIEW_STRICT=1    (optional — propagate all failures)
#   CI_ULTRAREVIEW_TIMEOUT=900 (optional — seconds, default 900)
#
# Exit codes:
#   0       Success, no P0 findings
#   1       P0 findings detected
#   2       Claude Code not installed / usage error (invalid args)
#   other   Propagated from claude ultrareview (STRICT mode only)

set -euo pipefail

# --- Argument validation ---
STRICT_FLAG=false
PR_INPUT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --strict)
      STRICT_FLAG=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--strict] <pr-number-or-url>" >&2
      echo "" >&2
      echo "Options:" >&2
      echo "  --strict   P1 findings also block CI (default: only P0 blocks)" >&2
      echo "" >&2
      echo "Environment:" >&2
      echo "  CI_ULTRAREVIEW_STRICT=1    Equivalent to --strict" >&2
      echo "  CI_ULTRAREVIEW_TIMEOUT=N   Timeout in seconds (default: 900)" >&2
      echo "" >&2
      echo "Examples:" >&2
      echo "  $0 42" >&2
      echo "  $0 --strict 42" >&2
      echo "  $0 https://github.com/org/repo/pull/42" >&2
      exit 0
      ;;
    *)
      if [ -n "$PR_INPUT" ]; then
        echo "Error: Unexpected argument: $1" >&2
        echo "Usage: $0 [--strict] <pr-number-or-url>" >&2
        exit 2
      fi
      PR_INPUT="$1"
      shift
      ;;
  esac
done

if [ -z "$PR_INPUT" ]; then
  echo "Usage: $0 [--strict] <pr-number-or-url>" >&2
  echo "  Example: $0 42" >&2
  echo "  Example: $0 --strict 42" >&2
  echo "  Example: $0 https://github.com/org/repo/pull/42" >&2
  exit 2
fi

# Extract numeric PR number from URL or bare number
if [[ "$PR_INPUT" =~ ^[0-9]+$ ]]; then
  PR_NUMBER="$PR_INPUT"
elif [[ "$PR_INPUT" =~ /pull/([0-9]+)$ ]]; then
  PR_NUMBER="${BASH_REMATCH[1]}"
else
  echo "Error: Invalid PR number or URL: $PR_INPUT" >&2
  echo "Expected a positive integer or a GitHub PR URL ending in /pull/<number>" >&2
  exit 2
fi

# --- Claude Code availability check ---
if ! command -v claude >/dev/null 2>&1; then
  echo "Error: claude CLI not found on PATH." >&2
  echo "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview" >&2
  exit 2
fi

# --- Configuration ---
OUT_DIR=".tinkerman/reviews"
OUT_FILE="$OUT_DIR/${PR_NUMBER}-ci.md"
TIMEOUT="${CI_ULTRAREVIEW_TIMEOUT:-900}"
# Merge env var and CLI flag (either enables strict mode)
if [ "$STRICT_FLAG" = true ] || [ "${CI_ULTRAREVIEW_STRICT:-0}" = "1" ]; then
  STRICT=1
else
  STRICT=0
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$SCRIPT_DIR/../templates/review-ci.md.tmpl"

mkdir -p "$OUT_DIR"

# --- Run claude ultrareview ---
TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

CLI_EXIT=0
TIMED_OUT=false

set +e
if command -v timeout >/dev/null 2>&1; then
  timeout "$TIMEOUT" claude ultrareview "$PR_INPUT" --json > "$TMP_JSON" 2>&1
  CLI_EXIT=$?
  # timeout returns 124 on timeout
  if [ "$CLI_EXIT" -eq 124 ]; then
    TIMED_OUT=true
    CLI_EXIT=0
  fi
elif command -v gtimeout >/dev/null 2>&1; then
  gtimeout "$TIMEOUT" claude ultrareview "$PR_INPUT" --json > "$TMP_JSON" 2>&1
  CLI_EXIT=$?
  if [ "$CLI_EXIT" -eq 124 ]; then
    TIMED_OUT=true
    CLI_EXIT=0
  fi
else
  # No timeout command available — run without timeout
  claude ultrareview "$PR_INPUT" --json > "$TMP_JSON" 2>&1
  CLI_EXIT=$?
fi
set -e

# --- Parse JSON output ---
COMMIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
BRANCH="${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo unknown)}"
RUN_ID="${GITHUB_RUN_ID:-0}"
CREATED_AT="$(date -u +%Y-%FT%H:%M:%SZ)"

P0_COUNT=0
P1_COUNT=0
P2_COUNT=0
P3_COUNT=0
SUMMARY=""
PARSE_OK=false

if command -v jq >/dev/null 2>&1 && [ -s "$TMP_JSON" ]; then
  # Validate JSON
  if jq empty "$TMP_JSON" 2>/dev/null; then
    PARSE_OK=true
    # Single jq pass: extract all severity counts + summary in one invocation
    read -r P0_COUNT P1_COUNT P2_COUNT P3_COUNT SUMMARY < <(
      jq -r '@sh "\([.findings[] | select(.severity == "P0")] | length) \([.findings[] | select(.severity == "P1")] | length) \([.findings[] | select(.severity == "P2")] | length) \([.findings[] | select(.severity == "P3")] | length) \(.summary // "UltraReview completed.")"' "$TMP_JSON" 2>/dev/null
    )
    P0_COUNT="${P0_COUNT:-0}"
    P1_COUNT="${P1_COUNT:-0}"
    P2_COUNT="${P2_COUNT:-0}"
    P3_COUNT="${P3_COUNT:-0}"
    SUMMARY="${SUMMARY:-UltraReview completed.}"
    # Strip surrounding quotes from jq @sh output
    SUMMARY="${SUMMARY#\'}"
    SUMMARY="${SUMMARY%\'}"
  fi
fi

if [ "$PARSE_OK" = false ]; then
  SUMMARY="UltraReview output could not be parsed."
fi

# --- Generate findings sections ---
generate_findings_section() {
  local severity="$1"
  local count="$2"

  if [ "$count" -eq 0 ]; then
    echo "_无_"
    return
  fi

  if [ "$PARSE_OK" = true ]; then
    local idx=0
    jq -r --arg sev "$severity" '
      .findings[] | select(.severity == $sev) |
      "**\(.file_path // "unknown"):\(.line // 0)** — \(.message // "no description") [\(.category // "general")]"
    ' "$TMP_JSON" | while IFS= read -r line; do
      idx=$((idx + 1))
      echo "${idx}. ${line}"
    done
  else
    echo "_JSON parse failed — see Raw JSON section_"
  fi
}

P0_FINDINGS="$(generate_findings_section P0 "$P0_COUNT")"
P1_FINDINGS="$(generate_findings_section P1 "$P1_COUNT")"
P2_FINDINGS="$(generate_findings_section P2 "$P2_COUNT")"
P3_FINDINGS="$(generate_findings_section P3 "$P3_COUNT")"

# --- Per-file findings table ---
generate_per_file_table() {
  local total=$((P0_COUNT + P1_COUNT + P2_COUNT + P3_COUNT))
  if [ "$total" -eq 0 ] || [ "$PARSE_OK" = false ]; then
    echo "_无 findings_"
    return
  fi

  echo "| File | Line | Severity | Category | Description |"
  echo "|------|------|----------|----------|-------------|"
  jq -r '
    .findings
    | sort_by(.file_path // "unknown", .severity)
    | .[]
    | "| \(.file_path // "unknown"):\(.line // 0) | \(.line // 0) | \(.severity // "P3") | \(.category // "general") | \(.message // "no description") |"
  ' "$TMP_JSON"
}

PER_FILE_TABLE="$(generate_per_file_table)"
TOTAL_FINDINGS=$((P0_COUNT + P1_COUNT + P2_COUNT + P3_COUNT))

# --- Optional frontmatter fields ---
TIMEOUT_FIELD=""
PARTIAL_FIELD=""
if [ "$TIMED_OUT" = true ]; then
  TIMEOUT_FIELD="timeout: true"
fi
if [ "$PARSE_OK" = false ]; then
  PARTIAL_FIELD="partial: true"
fi

# --- Read raw JSON ---
RAW_JSON=""
if [ -s "$TMP_JSON" ]; then
  RAW_JSON="$(cat "$TMP_JSON")"
else
  RAW_JSON="{}"
fi

# --- Generate artifact from template ---
if [ -f "$TEMPLATE" ]; then
  # Use template with variable substitution
  # shellcheck disable=SC1090
  artifact="$(sed \
    -e "s|{{PR_NUMBER}}|${PR_NUMBER}|g" \
    -e "s|{{COMMIT_SHA}}|${COMMIT_SHA}|g" \
    -e "s|{{BRANCH}}|${BRANCH}|g" \
    -e "s|{{RUN_ID}}|${RUN_ID}|g" \
    -e "s|{{CREATED_AT}}|${CREATED_AT}|g" \
    -e "s|{{P0_COUNT}}|${P0_COUNT}|g" \
    -e "s|{{P1_COUNT}}|${P1_COUNT}|g" \
    -e "s|{{P2_COUNT}}|${P2_COUNT}|g" \
    -e "s|{{P3_COUNT}}|${P3_COUNT}|g" \
    -e "s|{{SUMMARY}}|${SUMMARY}|g" \
    -e "s|{{TIMEOUT_FIELD}}|${TIMEOUT_FIELD}|g" \
    -e "s|{{PARTIAL_FIELD}}|${PARTIAL_FIELD}|g" \
    -e "s|{{TOTAL_FINDINGS}}|${TOTAL_FINDINGS}|g" \
    "$TEMPLATE")"

  # Replace finding sections, per-file table, and raw JSON using awk for multi-line content
  artifact="$(echo "$artifact" | awk -v p0="$P0_FINDINGS" -v p1="$P1_FINDINGS" -v p2="$P2_FINDINGS" -v p3="$P3_FINDINGS" -v pft="$PER_FILE_TABLE" -v raw="$RAW_JSON" '
    /^{{P0_FINDINGS}}$/ { print p0; next }
    /^{{P1_FINDINGS}}$/ { print p1; next }
    /^{{P2_FINDINGS}}$/ { print p2; next }
    /^{{P3_FINDINGS}}$/ { print p3; next }
    /^{{PER_FILE_TABLE}}$/ { print pft; next }
    /^{{RAW_JSON}}$/ { print raw; next }
    { print }
  ')"

  echo "$artifact" > "$OUT_FILE"
else
  # Fallback: generate without template
  cat > "$OUT_FILE" <<HEREDOC
---
source: "ci-ultrareview"
pr_number: ${PR_NUMBER}
commit_sha: "${COMMIT_SHA}"
branch: "${BRANCH}"
run_id: ${RUN_ID}
created_at: "${CREATED_AT}"
severity_counts:
  P0: ${P0_COUNT}
  P1: ${P1_COUNT}
  P2: ${P2_COUNT}
  P3: ${P3_COUNT}
strict: ${STRICT}
${TIMEOUT_FIELD}
${PARTIAL_FIELD}
---

# UltraReview CI Report — PR #${PR_NUMBER}

## Summary

${SUMMARY}

## Per-File Findings

${PER_FILE_TABLE}

## Summary Counts
- Total findings: ${TOTAL_FINDINGS}
- P0: ${P0_COUNT} | P1: ${P1_COUNT} | P2: ${P2_COUNT} | P3: ${P3_COUNT}

## Findings by Severity

### P0 (${P0_COUNT})

${P0_FINDINGS}

### P1 (${P1_COUNT})

${P1_FINDINGS}

### P2 (${P2_COUNT})

${P2_FINDINGS}

### P3 (${P3_COUNT})

${P3_FINDINGS}

## Raw JSON

\`\`\`json
${RAW_JSON}
\`\`\`
HEREDOC
fi

echo "Review artifact written to ${OUT_FILE}"

# --- Exit policy ---
if [ "$P0_COUNT" -gt 0 ]; then
  echo "P0 findings detected (${P0_COUNT}). Failing CI."
  exit 1
fi

if [ "$STRICT" = "1" ] && [ "$P1_COUNT" -gt 0 ]; then
  echo "P1 findings detected (${P1_COUNT}). Failing CI (--strict mode)."
  exit 1
fi

if [ "$CLI_EXIT" -ne 0 ]; then
  if [ "$STRICT" = "1" ]; then
    echo "UltraReview CLI exited with code ${CLI_EXIT} (STRICT mode). Propagating."
    exit "$CLI_EXIT"
  else
    echo "UltraReview CLI exited with code ${CLI_EXIT}. Soft-fail: exiting 0."
    exit 0
  fi
fi

exit 0
