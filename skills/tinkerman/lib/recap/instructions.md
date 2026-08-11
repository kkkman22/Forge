---
updated: 2026-08-11
description: "Use when running /tinkerman recap to review recent activity"
context: fork

dispatch_mode: fork
allowed_tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# /tinkerman recap — Time-Window Recap

> **Trigger**: `/tinkerman recap [--since 1d|7d|YYYY-MM-DD..YYYY-MM-DD]`
> **Output**: stdout summary + optional `.forge/recap-<window>.md`

## 1. 概述

Produce a categorized recap of recent project activity over a configurable time window, covering commits, sessions, and task progress.

## Delegation_Adapter

> 引用 `skills/shared/native-command-matrix.md` 获取完整配置

**Forge recap = `/compact` + `/context` + Forge 结构化摘要**

执行路径选择：

1. **standardPath**: 探测 `claude --version` ≥ 2.0.0
   - 调用 `/compact` 压缩当前会话上下文
   - 调用 `/context` 获取当前 context 状态
   - 两个 Native_Command 都成功(exit 0) → 执行 Forge 差异化上层
   - 任一 Native_Command 失败(exit ≠ 0) → abort Forge 上层，透传 exit code

2. **legacyPath**: 版本不满足或 Native_Command 不可用
   - 运行下方完整遗留行为
   - 首次触发时 emit Deprecation_Notice（per-session 去重）
   - Notice: `⚠️ [Forge Slimming] /tinkerman recap 基础层可委托给 /compact + /context（Claude Code ≥ 2.0.0）。迁移指南：docs/slimming-migration.md`

**Forge 差异化上层**（standardPath 成功后）：
- 从 `.forge/status.md` 提取当前 Spec 阶段、frozen file 列表
- 从 `.forge/progress/` 提取未完成的 progress 项
- 合并输出：Native_Command 结果 + Forge 结构化摘要

## Goal

## Data Sources

Your recap must aggregate across these sources. Approach is yours; all three must be represented:

| Source | Data |
|--------|------|
| `git log --since` | Commits, files changed, authors |
| `.forge/knowledge/sessions/` | Session metadata |
| `.forge/progress/` | Task completion status |

## Constraints

- **Categorization [R9.3]**: Every commit and task must be classified into one of: feature, bugfix, refactor, infra, docs, uncategorized. Use keywords in commit messages or task names; fallback to `uncategorized`.
- **Staleness detection [R9.4]**: Must scan `evolved-rules.md` for rules stale beyond 5 `Session_Boundary` entries and report them for cleanup.
- **Graceful degradation [R9.5]**: Missing git email → stderr warning + continue. Missing sessions or progress data → skip that section silently.
- **Idempotency [R13.6]**: For fixed input, running the same time window twice must produce identical output except for the `decided_at` timestamp.
- **No activity**: When the time window has no activity, explicitly report that fact rather than producing empty output.

## References

→ references/data-sources.md, references/category-heuristics.md

## Gotchas
- **Information overload**: Include every commit message → recap too long to be useful → categorize and summarize, don't list everything
- **Missing context**: Recap shows what changed but not why → reader can't assess impact → include issue/spec references
- **Stale time window**: Recap covers period with no activity → empty output → detect and report "no activity in window"
