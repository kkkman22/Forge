#!/usr/bin/env bash
# dispatcher.sh — Unified hook event dispatcher for Forge
# Routes all 6 hook events to dedicated handler functions.
# Trusts settings.json `if:` filters — no re-filtering here.
set -u

# Read event type from stdin JSON
read -r STDIN 2>/dev/null || STDIN=""
EVENT=$(echo "$STDIN" | grep -oP '"event"\s*:\s*"\K[^"]+' 2>/dev/null || echo "")

handle_session_start() {
  # Evolved rules loading is handled by separate hooks.json entry
  return 0
}

handle_user_prompt_submit() {
  # Plan context injection handled by separate hooks.json entry
  return 0
}

handle_pretool() {
  local tool_name="$TOOL_NAME"
  local tool_input_file="$TOOL_INPUT_FILE"
  local tool_input="$TOOL_INPUT"

  # Frozen zone check for Write/Edit
  if [ "$tool_name" = "Write" ] || [ "$tool_name" = "Edit" ]; then
    bash forge/scripts/hook-check-frozen.sh "$tool_input_file" 2>/dev/null || \
      bash ~/.claude/skills/forge/scripts/hook-check-frozen.sh "$tool_input_file" 2>/dev/null
    local rc=$?
    if [ $rc -eq 2 ]; then return 2; fi
    if [ $rc -ne 0 ]; then return $rc; fi

    # Sandbox check
    node forge/dist/src/check-sandbox.js Write "$tool_input_file" 2>/dev/null || \
      node ~/.claude/skills/forge/dist/src/check-sandbox.js Write "$tool_input_file" 2>/dev/null
    rc=$?
    if [ $rc -eq 2 ]; then return 2; fi

    # Context boundary check
    node forge/scripts/check-context-boundary.mjs "$tool_name" "$tool_input_file" 2>/dev/null || \
      node scripts/check-context-boundary.mjs "$tool_name" "$tool_input_file" 2>/dev/null || true
  fi

  # Frozen zone check for Bash (git commands touching .forge/)
  if [ "$tool_name" = "Bash" ]; then
    local frozen_match
    frozen_match=$(echo "$tool_input" | grep -oE '\.forge/(specs|plans)/[a-zA-Z0-9_.-]+|\.forge/config\.md' 2>/dev/null | sort -u || true)
    if [ -n "$frozen_match" ]; then
      echo "$frozen_match" | while read -r f; do
        bash forge/scripts/hook-check-frozen.sh "$f" 2>/dev/null || \
          bash ~/.claude/skills/forge/scripts/hook-check-frozen.sh "$f" 2>/dev/null
        local rc=$?
        if [ $rc -eq 2 ]; then return 2; fi
      done
    fi

    # Sandbox check (conditional on .sandbox-active.json)
    if [ -f .forge/.sandbox-active.json ]; then
      node forge/dist/src/check-sandbox.js Bash "$tool_input_file" 2>/dev/null || \
        node ~/.claude/skills/forge/dist/src/check-sandbox.js Bash "$tool_input_file" 2>/dev/null
      rc=$?
      if [ $rc -eq 2 ]; then return 2; fi
    fi
  fi

  return 0
}

handle_posttool() {
  local tool_name="$TOOL_NAME"

  if [ "$tool_name" = "Write" ] || [ "$tool_name" = "Edit" ]; then
    # Progress reminder
    if [ -d .forge/status ] || [ -f .forge/status.md ]; then
      echo "📝 代码已修改。请记得更新 .forge/progress/ 中的任务状态。"
    fi

    # cmux sync
    node scripts/cmux-mirror/sync-once.mjs .forge 2>/dev/null || true

    # Feature dossier rebuild
    node scripts/rebuild-feature-dossier.mjs --from-path "$TOOL_INPUT_FILE" 2>/dev/null || true
  fi

  return 0
}

handle_stop() {
  # Incomplete tasks check
  if [ -f .forge/progress/*.md ] 2>/dev/null; then
    local incomplete
    incomplete=$(grep -c '\- \[ \]' .forge/progress/*.md 2>/dev/null || echo 0)
    if [ "$incomplete" -gt 0 ]; then
      echo "⚠️ 仍有未完成的任务。下次会话可使用 /forge resume 恢复上下文。"
    else
      echo "✅ 任务已完成。建议运行 /forge learn 沉淀本次开发经验。"
    fi
  fi

  # Persistent loop
  bash forge/scripts/persistent-loop.sh 2>/dev/null || \
    bash ~/.claude/skills/forge/scripts/persistent-loop.sh 2>/dev/null || true

  # Pending evolved rules
  if [ -f .forge/knowledge/evolved-rules.md ] && grep -q 'PENDING' .forge/knowledge/evolved-rules.md 2>/dev/null; then
    local count
    count=$(grep -c 'PENDING' .forge/knowledge/evolved-rules.md 2>/dev/null || echo 0)
    echo "⚠️ 有 $count 条待审核的规则提案。运行 /forge learn 查看并审批。"
  fi

  # Record evolved rule violations
  node scripts/record-evolved-rule-violation.mjs 2>/dev/null || true

  # Flag stale evolved rules
  node scripts/flag-stale-evolved-rules.mjs 2>/dev/null || true

  # cmux sync
  node scripts/cmux-mirror/sync-once.mjs .forge 2>/dev/null || true

  # Phase verification nudge
  if [ -f .forge/status.md ]; then
    local phase
    phase=$(grep '^phase:' .forge/status.md 2>/dev/null | sed 's/phase: *"{\{0,1\}//;s/"}\{0,1\} *$//')
    if [ -n "$phase" ] && [ "$phase" != "completed" ] && [ "$phase" != "" ]; then
      echo "⚠️ Phase: $phase — did you verify your last change? Run the relevant test/lint command before stopping."
    fi
  fi

  return 0
}

handle_teammate_idle() {
  local status_file
  if [ -d .forge/status ]; then
    status_file=$(ls -t .forge/status/*.md 2>/dev/null | head -1)
  else
    status_file=".forge/status.md"
  fi

  local phase
  phase=$(grep '^phase:' "$status_file" 2>/dev/null | sed 's/phase: *"{\{0,1\}//;s/"}\{0,1\} *$//')
  if [ "$phase" = "review" ] || [ "$phase" = "decide" ]; then
    echo "队友空闲。请检查是否所有评审/决策维度都已完成输出，未完成的队友应继续工作。"
  fi

  return 0
}

# Main dispatch — exact match, no pattern matching
case "$EVENT" in
  SessionStart)      handle_session_start; return $? ;;
  UserPromptSubmit)  handle_user_prompt_submit; return $? ;;
  PreToolUse)        handle_pretool; return $? ;;
  PostToolUse)       handle_posttool; return $? ;;
  Stop)              handle_stop; return $? ;;
  TeammateIdle)      handle_teammate_idle; return $? ;;
  *)                 exit 0 ;;
esac
