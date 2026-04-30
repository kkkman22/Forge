#!/bin/sh
# run-with-trim.sh — POSIX verification command wrapper
# Wraps verification commands: success → truncate long output; failure → pass through unchanged
# Uses only POSIX utilities: tail, head, wc, cat, mktemp

set -e

# No arguments → usage
if [ $# -eq 0 ]; then
    echo "Usage: run-with-trim.sh <command> [args...]" >&2
    exit 1
fi

# Create temp file for output
tmpfile=$(mktemp 2>/dev/null) || { echo "run-with-trim: mktemp failed" >&2; exit 1; }
trap 'rm -f "$tmpfile"' EXIT

# Execute command, capture output and exit code (disable set -e for this)
set +e
"$@" > "$tmpfile" 2>&1
exit_code=$?
set -e

# Print header
echo "── run-with-trim ── $* ── exit:${exit_code} ──"

# Handle output based on exit code
if [ $exit_code -eq 0 ]; then
    # Success path: truncate if >30 lines
    line_count=$(wc -l < "$tmpfile")
    if [ "$line_count" -gt 30 ]; then
        echo "Output truncated: ${line_count} lines → last 10 lines shown"
        tail -10 "$tmpfile"
    else
        cat "$tmpfile"
    fi
else
    # Failure path: pass through unchanged
    cat "$tmpfile"
fi

exit $exit_code
