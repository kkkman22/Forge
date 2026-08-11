#!/usr/bin/env bash
#
# Forge Shared Helpers — sourced by hook scripts
#
# Provides common functions for reading .tinkerman/ state files.
# Usage: source "$(dirname "$0")/lib/forge-helpers.sh"

# Read a YAML frontmatter field from a .md file.
# Args: $1=file path, $2=field name
# Output: field value (empty string if not found)
read_field() {
  local file="$1"
  local field="$2"
  if [ ! -f "$file" ]; then
    echo ""
    return
  fi
  # Escape field for safe use in grep pattern
  local escaped_field
  escaped_field=$(printf '%s\n' "$field" | sed 's/[[\.*^$()+?{|\\]/\\&/g')
  grep "^${escaped_field}:" "$file" 2>/dev/null | sed -n "1s/^${escaped_field}: *\"\\{0,1\\}//;s/\"\\{0,1\\} *$//p" || echo ""
}

# Check if a file was modified within the last N minutes.
# Args: $1=file path, $2=max age in minutes
# Returns: 0 if fresh, 1 if stale or missing
is_fresh() {
  local file="$1"
  local max_age_minutes="$2"
  if [ ! -f "$file" ]; then
    return 1
  fi
  # macOS and Linux compatible: use find
  local count
  count=$(find "$file" -mmin "-${max_age_minutes}" 2>/dev/null | wc -l | tr -d ' ')
  [ "$count" -gt 0 ]
}

# Find the most recently modified file in a directory matching a glob pattern.
# Args: $1=directory, $2=pattern (e.g. '*.md')
# Output: file path (empty if none found)
find_latest() {
  local dir="$1"
  local pattern="$2"
  if [ ! -d "$dir" ]; then
    return
  fi
  find "$dir" -maxdepth 1 -name "$pattern" -exec stat -f '%m %N' {} \; 2>/dev/null | sort -rn | awk 'NR==1{sub(/^[0-9]+ /,""); print}'
}
