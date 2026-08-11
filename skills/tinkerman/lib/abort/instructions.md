---
description: "Use when user runs `/tinkerman abort`, decides to abandon the current task, or needs to clear an active task slot before starting a new one"

dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
  - Write
---

# /tinkerman abort — Task Abort

> **Trigger**: User inputs `/tinkerman abort`
> **Responsibility**: Safely abort the current task, archive existing state, clean up status.md, allow the user to cleanly start a new task
> **Output Path**: `.forge/archive/<date>-<topic>/` (archive) + `.forge/status.md` (reset)

---

## 1. Overview

`/tinkerman abort` 是 Forge 工作流的精简中止机制——仅归档 `.forge/status.md` 并重置 Forge-local 工作状态。

**核心原则**：中止不是失败，是明智的止损。已产生的工作成果归档保留，不丢弃。

**Delegation_Adapter**: 会话级 abort 逻辑不在此 skill 范围内。Forge 只管 `.forge/` 状态文件的归档与重置。会话级取消由 Claude Code 平台原生处理。

> ⚠️ Slimming Notice: 此 skill 已从"会话级 abort"精简为"归档+重置"。首次使用新版本时将输出 Deprecation_Notice。

**职责范围**（精简后）：
1. 归档 `.forge/status.md` 到 `.forge/archive/<ISO-date>-<topic>/`
2. 重置 Forge-local 工作状态（progress、status、findings 当前指针）

**不在范围内**：
- 会话级 abort（由 Claude Code 平台原生处理）
- Forge Loop worktree 清理（由 Forge Loop 独立管理，不触碰）

---

**Not For**：
- 任务即将完成（先完成再说）
- 临时遇到困难（先 debug）

## 2. Execution Flow

### Step 1: Confirm Abort

**Single-task mode**: Read `.forge/status.md` and display the current task status to the user.

```
⚠️ 即将中止当前任务

当前任务：<current_task>
档位：<tier>
阶段：<phase>

中止后：
  - 当前任务的所有状态文件将归档到 .forge/archive/
  - status.md 将被重置
  - 你可以立即开始新任务

确认中止？(y/n)
```

如果没有进行中的任务：`ℹ️ 当前没有进行中的任务，无需中止。`

**Multi-task mode**: Call `listActiveTasks(io, forgeRoot)` to display a numbered list of active tasks. The user selects a task to abort or chooses "abort all". When a specific task is selected, only that task's StatusFile is archived; other tasks are unaffected. When "abort all" is chosen, all active tasks are archived and the Legacy_StatusFile is reset.

### Step 2: Archive State Files

**Single-task mode**: Move all state files related to the current task to `.forge/archive/YYYY-MM-DD-<topic>/`.

**Multi-task mode**: Call `archiveTaskStatus(io, forgeRoot, taskName, date)` to move `.forge/status/<task-id>.md` to the archive directory. Other tasks' StatusFiles are unaffected.

| Source | Archive Condition |
|--------|-------------------|
| `.forge/decisions/<topic>*` | If exists |
| `.forge/specs/<topic>/` | If exists |
| `.forge/plans/<topic>*` | If exists |
| `.forge/findings/<topic>*` | If exists |
| `.forge/progress/<topic>*` | If exists |
| `.forge/reviews/<topic>*` | If exists |
| `.forge/debug/<topic>*` | If exists |

归档方式：移动（不是复制）。

### Step 3：重置 status.md

```yaml
---
current_task: ""
tier: ""
phase: ""
updated: 2026-08-11YYYY-MM-DD HH:mm"
---

# 项目状态

上一个任务已中止。使用 `/tinkerman` 开始新任务。
```

### Step 4：输出确认

```
✅ 任务已中止

归档位置：.forge/archive/YYYY-MM-DD-<topic>/
已归档文件：<N> 个

status.md 已重置。你可以使用 /tinkerman 开始新任务。
```

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "再试一次也许就好了" | 如果已经失败了多次，再试一次大概率还是失败。中止不是失败，是明智的止损 |
| "已经做了这么多不想浪费" | 沉没成本谬误。已产生的工作会归档保留，但继续投入在错误方向上才是真正的浪费 |
| "手动清理状态文件就行" | 手动清理容易遗漏，导致下次任务的状态污染。abort 确保干净的重置 |

---

## 3. 边界情况处理

| 条件 | 处理 |
|------|------|
| 无 `.forge/` 目录 | ⚠️ 请先运行 /tinkerman init |
| 无进行中的任务 | ℹ️ 当前没有进行中的任务，无需中止 |
| 用户取消中止 | ℹ️ 已取消中止。当前任务继续 |
| 归档目录已存在 | 追加序号：`.forge/archive/YYYY-MM-DD-<topic>-2/` |

---

## 4. 注意事项

- **abort 不会撤销代码变更**。已提交的 commit 不会被回滚。abort 只清理 `.forge/` 状态文件。
- **abort 不会删除知识**。`.forge/knowledge/` 目录不受影响——已沉淀的知识是项目资产。
- **归档文件可以手动恢复**。从 `.forge/archive/` 手动移回即可。

## Gotchas
- **Partial abort**: Only archives status but leaves working tree dirty → git stash or commit before abort → remind user to clean up
- **Orphan progress files**: Abort doesn't delete .forge/progress/ files → stale progress confused on resume → abort should note orphan files
- **Double abort**: Running abort twice on same task → second abort finds nothing to abort → idempotent, just warn
