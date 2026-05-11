---
feature: "ccbp-hardening-phase2"
status: locked
date: "2026-05-12"
import_source: ".kiro/specs/ccbp-hardening-phase2/"
decide_ref: ".forge/decisions/2026-05-12-ccbp-hardening-phase2-decide.md"
---

# Spec: CCBP Hardening Phase 2

> Imported from `.kiro/specs/ccbp-hardening-phase2/` (requirements.md + design.md + tasks.md)
> Full spec documents are in the import source. This file is the locked reference.

## Purpose

Phase 2 of `ccbp-inspired-hardening` — completes deferred migrations and adopts CC native capabilities:
- Hooks `if:` conditional filtering (v2.1.85)
- PreCompact/PostCompact boundary protection (v2.1.105/76)
- Agent frontmatter: `hooks` / `initialPrompt` / `isolation: worktree` (v2.1.0/50/83)
- Rules lazy-loading, CLAUDE.md second trim, CC version gating

## Requirements Summary

| Req | Title | Acceptance Criteria Count |
|-----|-------|--------------------------|
| 1 | Hooks `if:` 条件过滤全量迁移 | 6 |
| 2 | PreCompact / PostCompact 边界状态保护 | 7 |
| 3 | Agent `hooks:` frontmatter 使用 | 6 |
| 4 | Agent `initialPrompt` 使用 | 5 |
| 5 | Agent `isolation: "worktree"` (forge-build) | 6 |
| 6 | Hooks Dispatcher 剩余事件迁移 | 7 |
| 7 | `.claude/rules/` 完整迁移 | 8 |
| 8 | CLAUDE.md 第二轮瘦身（条件执行） | 5 |
| 9 | CC_Minimum_Version 声明与校验 | 6 |
| 10 | 契约测试与文档更新 | 6 |

## Explicit Non-Goals

- No more agent upgrades beyond plan/build/review/ship
- No `.forge/features/` migration to `.claude/rules/`
- No plugin / agent teams / channels
- No `.forge/config.md` breaking changes
- No frozen-zone structured feedback rewrite

## Decide Phase Decisions

1. **ci_cmd allowlist**: forge-build Stop hook must validate `$ci_cmd` against allowlist before execution (P1 security)
2. **worktree scope**: forge-build only — plan/review/ship stay in main repo
3. **Dispatcher design**: Trust settings.json `if:`, no re-filter in dispatcher
4. **Compaction snapshot**: Independent file, git-ignored

## Reversibility

Each Req has independent rollback path per design.md §4:
- Req 1: `git checkout HEAD~ hooks/hooks.json`
- Req 2: delete compact scripts + remove settings.json entries
- Req 3/4: remove agent frontmatter fields
- Req 5: remove `isolation: worktree` from forge-build.md
- Req 6: `git checkout HEAD~ dispatcher.sh`
- Req 7: delete rule files, restore CLAUDE.md content
- Req 8: restore CLAUDE.md from git
- Req 9: remove check_cc_version from init.sh

## Source Documents

- Requirements: `.kiro/specs/ccbp-hardening-phase2/requirements.md` (170 lines, 10 Requirements)
- Design: `.kiro/specs/ccbp-hardening-phase2/design.md` (729 lines, 8 change scenarios)
- Tasks: `.kiro/specs/ccbp-hardening-phase2/tasks.md` (624 lines, 9 Tasks, 62 sub-tasks)
- Decision: `.forge/decisions/2026-05-12-ccbp-hardening-phase2-decide.md`
