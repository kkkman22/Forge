# ADR: Claude Code Uplift (2.1.139–2.1.143)

**Date**: 2026-05-16
**Status**: Accepted
**Version**: 2.4.1

## Overview

Three Claude Code platform features consumed in a single sprint:

1. **CLAUDE_PROJECT_DIR env-first** (2.1.139): forge-context MCP resolves project root from env before falling back to cwd
2. **Stop hook 8-block cap** (2.1.143): compliance audit + contract tests ensuring no Forge Stop hook triggers the cap
3. **PostToolUse continueOnBlock** (2.1.139): context boundary violations feed back to Claude for in-turn self-correction

## Sub-ADRs

- [Stop Hook 8-Block Cap Audit](./2026-05-16-stop-hook-block-cap-audit.md) — all 6 hooks compliant
- [PostToolUse Feedback Evaluation](./2026-05-16-postooluse-feedback-evaluation.md) — mirror check-context-boundary as PostToolUse

## Changelog References

- Claude Code 2.1.139: `CLAUDE_PROJECT_DIR` injection for stdio MCP servers; PostToolUse `continueOnBlock` config option
- Claude Code 2.1.143: Stop hook consecutive block cap (8 blocks → turn ends with warning)

## Rollback Strategy

Each module can be independently reverted:
- **Module A** (env-first): Remove `resolveProjectRoot()` call in server.ts, revert tool signatures
- **Module B** (stop hook): Remove §2.4.1 from constitution, delete contract tests
- **Module C** (PostToolUse): Remove new PostToolUse entry from plugin.json, revert script
- **Module D**: Revert version bump

Rollback order: D → C → B → A (reverse of implementation).
