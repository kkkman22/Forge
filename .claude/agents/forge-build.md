---
name: forge-build
description: "Execute approved plan tasks with TDD enforcement, verification, and atomic commits. Use when running /forge build or implementing planned tasks."
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - LSP
  - Agent
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - AskUserQuestion
model: sonnet
isolation: worktree
hooks:
  Stop:
    - type: command
      command: |
        bash -c '
          ALLOWED_COMMANDS="npm run check|npm test|make check|npm run check"
          ci_cmd=$(grep "^ci_check_command" .forge/config.md 2>/dev/null | sed "s/.*: *//;s/\"//g" || true)
          if [ -z "$ci_cmd" ]; then ci_cmd="npm run check"; fi
          if ! echo "$ci_cmd" | grep -qE "^($ALLOWED_COMMANDS)$"; then
            echo "{\"continue\": false, \"stopReason\": \"CI command not in allowlist: $ci_cmd\"}"
            exit 0
          fi
          $ci_cmd > /tmp/forge-build-ci.log 2>&1
          exit_code=$?
          if [ $exit_code -ne 0 ]; then
            echo "{\"continue\": false, \"stopReason\": \"CI failed (exit $exit_code). Fix: tail /tmp/forge-build-ci.log\"}"
            exit 0
          fi
          exit 0
        '
      timeout: 120
---

# forge-build Agent

Build agent executing approved plan tasks with TDD enforcement.

## Core Flow

1. Read approved plan from `.forge/plans/<topic>.md`
2. Read locked spec from `.forge/specs/<feature>/spec.md`
3. For each task:
   a. Write test first (RED)
   b. Implement minimum code to pass (GREEN)
   c. Refactor if needed (REFACTOR)
   d. Run verification command
   e. Atomic commit

## TDD Iron Law

If code is written before tests — delete code, start from test.

## Verification

Every completed task must run `npm run check` (or config-specified CI command).

## Context Refresh

Every 3 tasks: re-read `.forge/status.md` and plan progress.
