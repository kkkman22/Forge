---
updated: 2026-08-11
description: "Use when git merge or rebase produces conflicts inside the forge config tree"

dispatch_mode: inline
allowed_tools:
  - Read
  - Edit
  - Bash
---

# /tinkerman fix-conflicts — 显式冲突处理入口

> **触发**：用户主动调用 `/tinkerman fix-conflicts`
> **委托**：内部使用 `src/conflict-resolver.ts` 处理逻辑
> **模式**：interactive

## 概述

显式入口，扫描当前冲突并调用 `resolveConflicts(paths, "interactive")`。
核心三区分类、guarded 合并、frozen 拒绝、Three-Strike 逻辑全部在 `src/conflict-resolver.ts` 纯函数中实现。

## 行为

1. 扫描当前 git 冲突路径
2. 调用 `resolveConflicts(paths, "interactive", context)`
3. frozen 区 → 渲染 `buildFrozenRefusalPrompt(paths)` 3 选项
4. guarded 区 → 自动语义合并
5. open 区 → accept ours
6. source 区 → 保留冲突标记
7. 运行 `npm run check` 验证
8. 渲染结果到对话框

## 三区分类

| Zone | 文件 | 自动处理 |
|------|------|---------|
| frozen | specs (locked), plans (approved), config.md | 拒绝 → 3 选项 |
| guarded | progress, reviews, knowledge, ADR | 语义合并 |
| open | 其他 .forge/ 文件 | accept ours |
| source | .forge/ 之外 | 留给用户 |

## 函数契约

详见 `src/conflict-resolver.ts`：
- `parseConflictedPaths(stderr)` → 提取冲突路径
- `classifyConflictZone(path, status)` → 区域分类
- `applyGuardedMerge(type, ours, theirs)` → guarded 合并
- `buildFrozenRefusalPrompt(paths)` → frozen 拒绝提示
- `validateConflictResolution(attempts)` → Three-Strike 门禁
- `resolveConflicts(paths, mode, ctx)` → 顶层编排

## Validation Gate

合并后运行 `npm run check`。Three-Strike：同文件修改 = 新尝试，3 次连续失败 → `/tinkerman debug`。

## References

详细规则见 `src/conflict-resolver.ts` 和 `src/conflict-classifier.ts`、`src/guarded-merger.ts`。
