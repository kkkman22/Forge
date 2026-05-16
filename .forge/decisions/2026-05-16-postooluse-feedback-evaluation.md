# ADR: PostToolUse Feedback Evaluation

**Date**: 2026-05-16
**Status**: Accepted
**Context**: Claude Code 2.1.139 (`continueOnBlock` feature)

## Decision

Introduce a new PostToolUse hook mirroring `check-context-boundary.mjs` in PostToolUse mode with `continueOnBlock: true`. The existing 3 PostToolUse hooks remain unchanged (classified as category (a) — no diagnostic feedback value).

## Evaluation of Existing PostToolUse Hooks

| # | Hook | Classification | Reason |
|---|------|---------------|--------|
| 1 | Inline echo "代码已修改" | (a) No diagnostic value | Reminder only, no violation detection |
| 2 | cmux-mirror/sync-once.mjs | (a) Mirror sync | Failure doesn't affect main workflow; already has `\|\| true` |
| 3 | rebuild-feature-dossier.mjs | (a) Background rebuild | Failure doesn't block next step; already has `\|\| true` |

**Category (c) candidates from existing hooks: 0.**

## Why Mirror check-context-boundary as PostToolUse

`check-context-boundary.mjs` currently runs as PreToolUse, blocking writes that introduce undeclared cross-context imports. Limitation: it inspects `new_string` / `content` from the tool input, not the file's final state. Multi-step Edit sequences can bypass this (e.g., remove import in edit 1, add it back in edit 2 where `new_string` alone looks innocent).

PostToolUse mode reads the file from disk after the write completes, catching violations that PreToolUse missed. With `continueOnBlock: true`, the diagnostic feeds back to Claude in the current turn for immediate self-correction — no need to wait for `/forge review`.

**Risk**: False positives waste one Claude reasoning cycle. Mitigated by: (a) same boundary logic as PreToolUse, (b) 5s timeout, (c) `\|\| true` fallback prevents turn blockage.

## Implementation

- Script: `scripts/check-context-boundary.mjs` gains `PostToolUse` mode (arg[2])
- PostToolUse mode reads file from disk instead of tool input
- Violation → stderr Chinese diagnostic + exit 2 (block signal for continueOnBlock)
- plugin.json: new PostToolUse entry with `continueOnBlock: true`, `timeout: 5`

## Reference

Claude Code 2.1.139 changelog: PostToolUse hooks can set `continueOnBlock: true` to feed block reason back to Claude.
