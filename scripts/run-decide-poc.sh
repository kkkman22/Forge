#!/usr/bin/env bash
set -euo pipefail

# run-decide-poc.sh — Run /tinkerman decide in both DAG and Teams modes for comparison
# Usage: ./scripts/run-decide-poc.sh <topic-id> [--iterations N]

TOPIC_ID="${1:?Usage: run-decide-poc.sh <topic-id> [--iterations N]}"

# Sanitize TOPIC_ID: only alphanumeric + single hyphens, no path traversal
if [[ ! "$TOPIC_ID" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]]; then
  echo "Error: Invalid topic-id '$TOPIC_ID'. Only alphanumeric characters and hyphens allowed." >&2
  exit 1
fi

shift || true

ITERATIONS=2
if [[ "${1:-}" == "--iterations" && -n "${2:-}" ]]; then
  ITERATIONS="$2"
fi

TOPIC_FILE=".tinkerman/specs/forge-decide-agent-teams/poc-topics.md"
OUT_DIR=".tinkerman/runs/decide-poc"
mkdir -p "$OUT_DIR"

if [[ ! -f "$TOPIC_FILE" ]]; then
  echo "Error: $TOPIC_FILE not found" >&2
  exit 1
fi

# Extract topic by id (## A: ..., ## B: ..., ## C: ...)
extract_topic() {
  local id="$1"
  awk "/^## ${id}:/,/^## [A-Z0-9]+:/" "$TOPIC_FILE" | head -n -1 | tail -n +2
}

TOPIC=$(extract_topic "$TOPIC_ID")
if [[ -z "$TOPIC" ]]; then
  echo "Error: Topic '$TOPIC_ID' not found in $TOPIC_FILE" >&2
  echo "Available topics:" >&2
  grep "^## " "$TOPIC_FILE" | sed 's/## //' >&2
  exit 1
fi

echo "=== PoC: $TOPIC_ID ==="
echo "Topic: $(echo "$TOPIC" | head -1)"
echo "Iterations: $ITERATIONS"
echo ""

run_mode() {
  local mode="$1"
  local iter="$2"
  local label="${TOPIC_ID}-${mode}-iter${iter}"
  local t0
  t0=$(date +%s)

  echo "--- Running $label ---"

  local mode_flag=""
  if [[ "$mode" == "teams" ]]; then
    mode_flag="--mode=teams"
  fi

  claude -p "/tinkerman decide $mode_flag $TOPIC" \
    --output-format stream-json > "$OUT_DIR/${label}.jsonl" 2>/dev/null || {
      echo "  Warning: $mode iteration $iter exited with error" >&2
    }

  local t1
  t1=$(date +%s)
  local duration=$((t1 - t0))
  echo "$duration" > "$OUT_DIR/${label}.duration"
  echo "  Duration: ${duration}s"
}

for i in $(seq 1 "$ITERATIONS"); do
  run_mode dag "$i"
  run_mode teams "$i"
done

# Parse metrics if parser exists
if [[ -f "scripts/parse-decide-poc-metrics.mjs" ]]; then
  node scripts/parse-decide-poc-metrics.mjs "$TOPIC_ID" > "$OUT_DIR/${TOPIC_ID}-metrics.md"
  echo ""
  echo "Metrics: $OUT_DIR/${TOPIC_ID}-metrics.md"
fi

echo ""
echo "=== PoC complete for $TOPIC_ID ==="
