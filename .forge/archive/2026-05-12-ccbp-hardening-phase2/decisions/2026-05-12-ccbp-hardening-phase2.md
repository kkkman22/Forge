---
title: "CCBP Hardening Phase 2"
date: "2026-05-12"
status: approved
spec: ".kiro/specs/ccbp-hardening-phase2/"
---

# ADR: CCBP Hardening Phase 2

## Context

Phase 1 (`ccbp-inspired-hardening`) added SKILL enhancements (context:fork, Gotchas, important-if) and 4 lazy-loaded rules. Phase 2 adopts newer Claude Code native capabilities: `if:` hook filtering (v2.1.85), PreCompact/PostCompact hooks (v2.1.105), agent frontmatter `hooks`/`initialPrompt`/`isolation` (v2.1.0+).

## Decision

1. **Hooks `if:` migration** — Added `if:` filters to 5 PreToolUse/PostToolUse entries to skip irrelevant tool calls. All 7 inline `if [` patterns check project state (not tool input) and cannot be migrated.
2. **Compaction protection** — PreCompact writes snapshot, PostCompact restores + deletes. `trap 'exit 0' ERR` prevents compaction blocking.
3. **Agent frontmatter** — forge-build gets `hooks: {Stop}` (CI with allowlist) + `isolation: worktree`; forge-ship gets `hooks: {PreToolUse}` (branch guard); forge-plan gets `initialPrompt`.
4. **Dispatcher** — Created `.claude/hooks/scripts/dispatcher.sh` with 6 handler functions.
5. **Rules** — Added 3 new lazy-loaded rules: forge-src, skill-editing, branch-protection.
6. **CC version gate** — init.sh checks >= 2.1.121, recommends >= 2.1.138.
7. **ci_cmd allowlist** — forge-build Stop hook validates CI command against allowlist before execution (security fix from decide phase).

## Rollback

Each change is independently revertible:
- hooks.json: `git checkout HEAD~1 -- hooks/hooks.json`
- Compact hooks: delete scripts + remove from hooks.json
- Agent files: delete from `.claude/agents/`
- Dispatcher: delete `.claude/hooks/scripts/dispatcher.sh`
- Rules: delete from `.claude/rules/`
- Version gate: remove `check_cc_version` from init.sh
