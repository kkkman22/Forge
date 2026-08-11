#!/usr/bin/env bash
# category: internal-only
# zone-registry.sh — Shared Zone_Registry functions for frozen/guarded zone hooks.
#
# Exports:
#   parse_zone_registry   — parse .forge/config.md into zone rules
#   classify_path         — classify a file path into zone category
#   emit_frozen_diagnostic — output structured Frozen_Diagnostic JSON
#   log_event             — append frozen-zone event to audit log
#
# Sourced by: hook-check-frozen-structured.sh, hook-check-frozen-post.sh,
#             summarize-frozen-events.sh, print-zone-registry.sh
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Feature flag: default to structured mode
FORGE_STRUCTURED_FROZEN="${FORGE_STRUCTURED_FROZEN:-1}"

# Audit log rotation threshold
readonly AUDIT_LOG_MAX_BYTES=10485760  # 10 MB

# ---------------------------------------------------------------------------
# parse_zone_registry
# ---------------------------------------------------------------------------
# Reads .forge/config.md and outputs normalized zone rules on stdout.
# Output format: <glob>\t<category>\t<reason_code>\t<qualifier>
#
# Cached via env var ZONE_REGISTRY_CACHE for single-turn reuse.
parse_zone_registry() {
  # Return cached result if available
  if [[ -n "${ZONE_REGISTRY_CACHE:-}" ]]; then
    printf '%s' "$ZONE_REGISTRY_CACHE"
    return 0
  fi

  local config_file=""
  for candidate in ".forge/config.md" "forge/.forge/config.md"; do
    if [[ -f "$candidate" ]]; then
      config_file="$candidate"
      break
    fi
  done

  if [[ -z "$config_file" ]]; then
    # Fallback to hard-coded defaults
    _emit_default_rules
    return 0
  fi

  local result=""
  result=$(_parse_config_file "$config_file")

  if [[ -z "$result" ]]; then
    _emit_default_rules
    return 0
  fi

  # Cache the result
  export ZONE_REGISTRY_CACHE="$result"
  printf '%s' "$result"
}

_emit_default_rules() {
  printf '%s\t%s\t%s\t%s\n' "specs/" "frozen-spec" "SPEC_LOCKED" "status:locked"
  printf '%s\t%s\t%s\t%s\n' "plans/" "frozen-plan" "PLAN_APPROVED" "status:approved"
  printf '%s\t%s\t%s\t%s\n' "config.md" "frozen-config" "CONFIG_ROOT" ""
  printf '%s\t%s\t%s\t%s\n' "progress/" "guarded-append" "GUARDED_APPEND_VIOLATION" ""
  printf '%s\t%s\t%s\t%s\n' "reviews/" "guarded-no-overwrite" "GUARDED_OVERWRITE_VIOLATION" ""
  printf '%s\t%s\t%s\t%s\n' "knowledge/instincts.md" "guarded-append" "GUARDED_APPEND_VIOLATION" ""
  printf '%s\t%s\t%s\t%s\n' "knowledge/known-failures.md" "guarded-append" "GUARDED_APPEND_VIOLATION" ""
  printf '%s\t%s\t%s\t%s\n' "knowledge/solutions/" "guarded-append" "GUARDED_APPEND_VIOLATION" ""
  printf '%s\t%s\t%s\t%s\n' "knowledge/evolved-rules.md" "guarded-append" "GUARDED_APPEND_VIOLATION" ""
  printf '%s\t%s\t%s\t%s\n' "knowledge/rule-changelog.md" "guarded-append" "GUARDED_APPEND_VIOLATION" ""
  echo "[zone-registry] WARNING: using hard-coded default rules (config.md missing or unparseable)" >&2
}

_parse_config_file() {
  local config_file="$1"
  local content=""
  content=$(cat "$config_file" 2>/dev/null) || return 1

  local rules=""

  # Parse frozen zone from HARD-GATE block
  local frozen_block=""
  frozen_block=$(printf '%s' "$content" | awk '/<HARD-GATE name="frozen-zone-protection">/,/<\/HARD-GATE>/ { if (!/<HARD-GATE/ && !/<\/HARD-GATE/) print }')

  if [[ -n "$frozen_block" ]]; then
    while IFS= read -r line; do
      # Match lines like: - `.forge/specs/*/spec.md`（status: locked）
      local raw_glob="" qualifier=""
      if [[ "$line" =~ \`\.forge/([^\`]+)\` ]]; then
        raw_glob="${BASH_REMATCH[1]}"
      fi
      [[ -z "$raw_glob" ]] && continue

      # Convert glob to prefix pattern for matching
      # specs/*/spec.md → specs/ (match any file under specs/)
      # plans/*.md → plans/ (match any file under plans/)
      # config.md → config.md (exact match)
      local glob=""
      if [[ "$raw_glob" == *\** ]]; then
        # Contains wildcard — extract directory prefix
        glob="${raw_glob%%/*}/"
      elif [[ "$raw_glob" == */* ]]; then
        # Has path separator but no wildcard — keep full path for exact match
        glob="$raw_glob"
      else
        glob="$raw_glob"
      fi

      # Extract optional status qualifier
      if [[ "$line" =~ （status:[[:space:]]*([a-z]+)） ]] || [[ "$line" =~ \(status:[[:space:]]*([a-z]+)\) ]]; then
        qualifier="status:${BASH_REMATCH[1]}"
      fi

      local category="" reason_code=""
      case "$glob" in
        specs/*) category="frozen-spec"; reason_code="SPEC_LOCKED" ;;
        plans/*) category="frozen-plan"; reason_code="PLAN_APPROVED" ;;
        config.md) category="frozen-config"; reason_code="CONFIG_ROOT" ;;
        *) category="frozen-custom"; reason_code="ZONE_CUSTOM" ;;
      esac

      rules="${rules}${glob}"$'\t'"${category}"$'\t'"${reason_code}"$'\t'"${qualifier}"$'\n'
    done <<< "$frozen_block"
  fi

  # Parse guarded zone from "受保护区" section
  # Stop at "开放区" section or next ### heading
  local guarded_block=""
  guarded_block=$(printf '%s' "$content" | awk '
    /^###.*受保护区/ { in_guarded=1; next }
    /^###.*开放区/ { in_guarded=0 }
    in_guarded && /^### / { in_guarded=0 }
    in_guarded { print }
  ')

  if [[ -n "$guarded_block" ]]; then
    while IFS= read -r line; do
      local raw_glob=""
      if [[ "$line" =~ \`\.forge/([^\`]+)\` ]]; then
        raw_glob="${BASH_REMATCH[1]}"
      fi
      [[ -z "$raw_glob" ]] && continue

      # Convert glob to prefix pattern
      local glob=""
      if [[ "$raw_glob" == *\** ]]; then
        # Contains wildcard — extract directory prefix
        glob="${raw_glob%%/*}/"
      elif [[ "$raw_glob" == */* ]]; then
        # Has path but no wildcard — keep full path for exact match
        glob="$raw_glob"
      else
        glob="$raw_glob"
      fi

      local modifier="append"
      if echo "$line" | grep -qi "no-overwrite\|no-delete"; then
        modifier="no-overwrite"
      fi

      local category="guarded-${modifier}"
      local reason_code
      reason_code="GUARDED_$(echo "$modifier" | tr '[:lower:]' '[:upper:]')_VIOLATION"

      rules="${rules}${glob}"$'\t'"${category}"$'\t'"${reason_code}"$'\t'$'\n'
    done <<< "$guarded_block"
  fi

  printf '%s' "$rules"
}

# ---------------------------------------------------------------------------
# classify_path
# ---------------------------------------------------------------------------
# Classify a file path against Zone_Registry rules.
# Args: <absolute-or-relative-path>
# Outputs: "<category> <reason_code>" on stdout
# Category is one of: frozen-spec, frozen-plan, frozen-config, frozen-custom,
#                      guarded-append, guarded-no-overwrite, none
classify_path() {
  local input_path="${1:-}"
  local forge_relative=""

  # Normalize to .forge/-relative path
  forge_relative=$(_normalize_to_forge_relative "$input_path")

  # Nothing to classify if not under .forge/
  if [[ -z "$forge_relative" ]]; then
    echo "none NONE"
    return 0
  fi

  local rules=""
  rules=$(parse_zone_registry)

  local best_category="none"
  local best_reason="NONE"
  local best_priority=0

  while IFS=$'\t' read -r glob category reason_code qualifier; do
    [[ -z "$glob" ]] && continue

    if _path_matches_rule "$forge_relative" "$glob"; then
      # Check status qualifier
      if [[ -n "$qualifier" ]] && [[ "$qualifier" == status:* ]]; then
        local required_status="${qualifier#status:}"
        local actual_status=""
        actual_status=$(_read_file_status "$forge_relative" "$input_path")
        if [[ "$actual_status" != "$required_status" ]]; then
          # Frozen zone paths are protected even when the file doesn't exist yet
          # (prevents AI from creating/modifying files in frozen directories)
          if [[ -z "$actual_status" ]] && [[ "$category" == frozen-* ]]; then
            : # allow through — path-based frozen protection
          else
            continue
          fi
        fi
      fi

      # Priority: frozen > guarded, most specific wins
      local priority=1
      case "$category" in
        frozen-*) priority=3 ;;
        guarded-*) priority=2 ;;
      esac

      if [[ $priority -gt $best_priority ]]; then
        best_category="$category"
        best_reason="$reason_code"
        best_priority=$priority
      fi
    fi
  done <<< "$rules"

  echo "${best_category} ${best_reason}"
}

_normalize_to_forge_relative() {
  local input="$1"
  # Unify separators
  input="${input//\\//}"
  # Find .forge/ marker
  if [[ "$input" == *".forge/"* ]]; then
    local suffix="${input#*.forge/}"
    # Strip leading ./ or /
    suffix="${suffix#./}"
    suffix="${suffix#/}"
    printf '%s' "$suffix"
    return 0
  fi
  printf ''
}

_path_matches_rule() {
  local forge_relative="$1"
  local glob="$2"

  # Exact match (e.g. "config.md" or "knowledge/instincts.md")
  if [[ "$forge_relative" == "$glob" ]]; then
    return 0
  fi

  # Prefix match (rule is a directory prefix like "specs/" or "plans/")
  if [[ "$glob" == */ ]] && [[ "$forge_relative" == "${glob}"* ]]; then
    return 0
  fi

  return 1
}

_read_file_status() {
  local forge_relative="$1"
  local input_path="$2"
  local target=""

  # Find the actual file
  for candidate in ".forge/$forge_relative" "forge/.forge/$forge_relative" "$input_path"; do
    if [[ -f "$candidate" ]]; then
      target="$candidate"
      break
    fi
  done

  if [[ -z "$target" ]] || [[ ! -f "$target" ]]; then
    echo ""
    return 0
  fi

  # Read with timeout (simplified: use head + frontmatter extraction)
  local content=""
  content=$(head -20 "$target" 2>/dev/null) || return 0

  # Extract status from YAML frontmatter
  if [[ "$content" == ---* ]]; then
    local status_line=""
    status_line=$(printf '%s' "$content" | grep -m1 '^status:' || true)
    if [[ -n "$status_line" ]]; then
      local val="${status_line#status:}"
      val="${val# }"
      val="${val#\"}"
      val="${val%\"}"
      val="${val#'}"
      val="${val%'}"
      echo "$val"
      return 0
    fi
  fi

  echo ""
}

# ---------------------------------------------------------------------------
# emit_frozen_diagnostic
# ---------------------------------------------------------------------------
# Output a structured Frozen_Diagnostic JSON object.
# Args: <path> <category> <reason_code>
# Outputs: JSON object on stdout
emit_frozen_diagnostic() {
  local path="${1:-}"
  local category="${2:-}"
  local reason_code="${3:-}"

  local reason_text=""
  local suggested_alt=""
  local unlock_instruction=""

  case "$category" in
    frozen-spec)
      reason_text="Spec 文件已锁定，不可修改。"
      suggested_alt=".forge/findings/$(echo "$path" | sed 's/[^a-zA-Z0-9]/-/g' | head -c 40).md"
      unlock_instruction="将 spec.md 的 frontmatter status 改为 draft（需要用户手动操作）。"
      ;;
    frozen-plan)
      reason_text="Plan 已批准，不可修改。"
      suggested_alt=".forge/findings/$(echo "$path" | sed 's/[^a-zA-Z0-9]/-/g' | head -c 40).md"
      unlock_instruction="将 plan.md 的 frontmatter status 改为 draft（需要用户手动操作）。"
      ;;
    frozen-config)
      reason_text=".forge/config.md 是项目配置根文件，不可通过 hook 自动修改。"
      suggested_alt=""
      unlock_instruction="手动编辑 .forge/config.md 或通过 /tinkerman init 重新生成。"
      ;;
    frozen-custom)
      reason_text="此文件位于自定义冻结区，不可修改。"
      suggested_alt=""
      unlock_instruction="检查 .forge/config.md 的 HARD-GATE 配置，或联系维护者解锁。"
      ;;
    guarded-append)
      reason_text="受保护区文件仅允许追加，不允许覆盖或删除。"
      suggested_alt=""
      unlock_instruction="使用 Edit 工具追加内容，或使用 Write 工具确保新内容包含旧内容。"
      ;;
    guarded-no-overwrite)
      reason_text="受保护区文件不允许覆盖。"
      suggested_alt=""
      unlock_instruction="使用 Edit 工具修改特定部分，不要用 Write 覆盖整个文件。"
      ;;
    *)
      reason_text="文件处于受保护区域。"
      suggested_alt=""
      unlock_instruction="检查 .forge/config.md 了解保护规则。"
      ;;
  esac

  local message_md="**Frozen-Zone Protection**: \`${path}\` — ${reason_text} Category: ${category}. ${unlock_instruction}"
  if [[ -n "$suggested_alt" ]]; then
    message_md="${message_md} Consider writing to \`${suggested_alt}\` instead."
  fi

  # Output JSON using printf + manual construction (avoid jq dependency in core)
  printf '{"path":"%s","category":"%s","reason_code":"%s","reason_text":"%s","suggested_alternative_path":"%s","unlock_instruction":"%s","message_md":"%s"}\n' \
    "$(_json_escape "$path")" \
    "$category" \
    "$reason_code" \
    "$(_json_escape "$reason_text")" \
    "$(_json_escape "$suggested_alt")" \
    "$(_json_escape "$unlock_instruction")" \
    "$(_json_escape "$message_md")"
}

_json_escape() {
  local s="${1:-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

# ---------------------------------------------------------------------------
# log_event
# ---------------------------------------------------------------------------
# Append a frozen-zone event to the audit log.
# Args: <decision> <path> <category> <reason_code> <outcome>
# decision: "pre" or "post"
# outcome: "denied", "allowed", "breached"
log_event() {
  local decision="${1:-pre}"
  local path="${2:-}"
  local category="${3:-}"
  local reason_code="${4:-}"
  local outcome="${5:-denied}"

  local runs_dir=""
  for candidate in ".forge/runs" "forge/.forge/runs"; do
    if [[ -d "$candidate" ]] || mkdir -p "$candidate" 2>/dev/null; then
      runs_dir="$candidate"
      break
    fi
  done

  [[ -z "$runs_dir" ]] && return 0

  local today
  today=$(date -u +%Y-%m-%d)
  local log_file="${runs_dir}/${today}-frozen-events.jsonl"

  local timestamp
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  local session_id="${FORGE_SESSION_ID:-unknown}"
  local tool_name="${TOOL_NAME:-unknown}"

  # Build JSON line
  local json_line
  printf -v json_line '{"timestamp":"%s","session_id":"%s","tool_name":"%s","path":"%s","category":"%s","reason_code":"%s","decision":"%s","outcome":"%s"}' \
    "$timestamp" \
    "$(_json_escape "$session_id")" \
    "$(_json_escape "$tool_name")" \
    "$(_json_escape "$path")" \
    "$category" \
    "$reason_code" \
    "$decision" \
    "$outcome"

  # Append with flock for concurrency safety
  if command -v flock >/dev/null 2>&1; then
    (
      flock -x 200
      echo "$json_line" >> "$log_file"
    ) 200>"${log_file}.lock"
  else
    echo "$json_line" >> "$log_file"
  fi

  # Rotation: if log exceeds threshold, rotate
  if [[ -f "$log_file" ]]; then
    local file_size
    file_size=$(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo 0)
    if [[ $file_size -gt $AUDIT_LOG_MAX_BYTES ]]; then
      mv "$log_file" "${log_file}.1" 2>/dev/null || true
    fi
  fi

  # Optional: OTel emission
  if [[ -n "${OTEL_TRACES_EXPORTER:-}" ]] || [[ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]]; then
    _emit_otel_event "$path" "$category" "$reason_code" "$decision" "$outcome" || true
  fi
}

_emit_otel_event() {
  # OTel emission is a no-op placeholder — actual implementation requires
  # an OTel SDK or otel-cli. This hook records the span attributes for
  # future integration.
  :
}

# ---------------------------------------------------------------------------
# guarded_append_check
# ---------------------------------------------------------------------------
# Check if a Write operation is a valid append (content superset).
# Args: <file_path> <tool_input_json>
# Returns: 0 = allow (append), 1 = deny (overwrite)
guarded_append_check() {
  local file_path="${1:-}"
  local tool_input="${2:-}"

  # Find the actual file
  local actual_file=""
  for candidate in "$file_path" ".forge/$file_path" "forge/.forge/$file_path"; do
    if [[ -f "$candidate" ]]; then
      actual_file="$candidate"
      break
    fi
  done

  # If file doesn't exist, Write is always creating new — allow
  [[ -z "$actual_file" ]] && return 0

  # Extract content from tool_input JSON (field: content)
  local new_content=""
  if command -v jq >/dev/null 2>&1; then
    new_content=$(printf '%s' "$tool_input" | jq -r '.tool_input.content // .content // ""' 2>/dev/null) || new_content=""
  else
    # Fallback: crude extraction
    new_content=$(printf '%s' "$tool_input" | grep -o '"content":"[^"]*"' | head -1 | sed 's/"content":"//;s/"$//') || new_content=""
  fi

  [[ -z "$new_content" ]] && return 0

  # Read existing content
  local existing_content=""
  existing_content=$(cat "$actual_file" 2>/dev/null) || return 1

  # Check if existing content is a prefix of new content (superset = append)
  if [[ "$new_content" == "${existing_content}"* ]]; then
    return 0  # Append allowed
  fi

  return 1  # Overwrite detected
}
