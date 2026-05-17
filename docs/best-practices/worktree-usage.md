# Worktree 使用指南

## 概述

Forge 使用 git worktree 实现分支隔离，确保每个功能在独立的工作树中开发。

## 分支保护规则

- **禁止在 `main`/`master` 上直接修改代码**
- 功能分支命名：`feature/<topic>` 或 `forge/<topic>`
- `<topic>` 从 `.forge/status.md` 的 `current_task` 字段提取

## 工作流

### 1. 创建功能分支

```bash
git checkout -b feature/<topic>
```

### 2. 开发循环

```bash
# Plan 阶段（可在任意分支执行）
/forge plan <spec-path>

# Build 阶段（必须在功能分支）
/forge build <plan-path>

# Review 阶段
/forge review

# Test 阶段
/forge test

# Ship 阶段
/forge ship
```

### 3. 上下文恢复

会话中断后使用 `/forge resume` 恢复：

```
/forge resume
```

从 `.forge/progress/` 和 `.forge/knowledge/sessions/` 读取上下文。

## 会话边界

- 每个 `/forge` 命令构成一个自然 Session Boundary
- 阶段间上下文交接通过 `.forge/` 文件系统进行
- 建议在 `/forge` 命令之间开启新的 Claude Code 会话
- 上下文超过 100K tokens 时建议新开会话

## 状态文件

| 文件 | 用途 |
|------|------|
| `.forge/status.md` | 当前任务状态 |
| `.forge/progress/*.md` | 任务进度记录 |
| `.forge/specs/*/spec.md` | 需求规格（锁定后不可修改） |
| `.forge/plans/*.md` | 执行计划（批准后不可修改） |
| `.forge/reviews/*.md` | 评审记录 |

## 相关文件

- Build SKILL：`skills/forge/lib/build/instructions.md` §2.1 Branch Gate
- 状态管理：`src/status-manager.ts`
- Worktree 管理：`src/worktree-manager.ts`
