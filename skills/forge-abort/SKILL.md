---
name: forge-abort
description: "任务中止。安全中止当前任务，归档状态到 .forge/archive/，重置 status.md。"
disable-model-invocation: true
---

# /forge abort — 任务中止

> **触发方式**：用户输入 `/forge abort`
> **职责**：安全中止当前任务，归档已有状态，清理 status.md，让用户可以干净地开始新任务
> **输出路径**：`.forge/archive/<date>-<topic>/`（归档）+ `.forge/status.md`（重置）

---

## 1. 概述

`/forge abort` 是 Forge 工作流的安全退出机制。当用户在任何阶段发现当前任务不值得继续（需求不成立、方向错误、优先级变更等），可以通过 abort 干净地中止任务，而不是手动删文件或无视状态开新任务。

**核心原则**：中止不是失败，是明智的止损。已产生的工作成果（决策文档、Spec、Plan 等）归档保留，不丢弃——它们可能在未来有参考价值。

---

## 2. 执行流程

### Step 1：确认中止

**单任务模式**：读取 `.forge/status.md`，向用户展示当前任务状态。

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

**多任务模式**：调用 `listActiveTasks(io, forgeRoot)` 显示活跃任务编号列表，用户选择要中止的任务或选择 "abort all"。选择特定任务时仅归档该任务的 StatusFile，其他任务不受影响。选择 "abort all" 时归档所有活跃任务并重置 Legacy_StatusFile。

### Step 2：归档状态文件

**单任务模式**：将当前任务相关的状态文件移动到 `.forge/archive/YYYY-MM-DD-<topic>/`。

**多任务模式**：调用 `archiveTaskStatus(io, forgeRoot, taskName, date)` 将 `.forge/status/<task-id>.md` 移动到归档目录。其他任务的 StatusFile 不受影响。

| 来源 | 归档条件 |
|------|---------|
| `.forge/decisions/<topic>*` | 如果存在 |
| `.forge/specs/<topic>/` | 如果存在 |
| `.forge/plans/<topic>*` | 如果存在 |
| `.forge/findings/<topic>*` | 如果存在 |
| `.forge/progress/<topic>*` | 如果存在 |
| `.forge/reviews/<topic>*` | 如果存在 |
| `.forge/debug/<topic>*` | 如果存在 |

归档方式：移动（不是复制）。

### Step 3：重置 status.md

```yaml
---
current_task: ""
tier: ""
phase: ""
updated: "YYYY-MM-DD HH:mm"
---

# 项目状态

上一个任务已中止。使用 `/forge` 开始新任务。
```

### Step 4：输出确认

```
✅ 任务已中止

归档位置：.forge/archive/YYYY-MM-DD-<topic>/
已归档文件：<N> 个

status.md 已重置。你可以使用 /forge 开始新任务。
```

---

## 3. 边界情况处理

| 条件 | 处理 |
|------|------|
| 无 `.forge/` 目录 | ⚠️ 请先运行 forge init |
| 无进行中的任务 | ℹ️ 当前没有进行中的任务，无需中止 |
| 用户取消中止 | ℹ️ 已取消中止。当前任务继续 |
| 归档目录已存在 | 追加序号：`.forge/archive/YYYY-MM-DD-<topic>-2/` |

---

## 4. 注意事项

- **abort 不会撤销代码变更**。已提交的 commit 不会被回滚。abort 只清理 `.forge/` 状态文件。
- **abort 不会删除知识**。`.forge/knowledge/` 目录不受影响——已沉淀的知识是项目资产。
- **归档文件可以手动恢复**。从 `.forge/archive/` 手动移回即可。
