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

读取 `.forge/status.md`，向用户展示当前任务状态：

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

**如果没有进行中的任务**（status.md 的 current_task 为空）：

```
ℹ️ 当前没有进行中的任务，无需中止。
```

### Step 2：归档状态文件

将当前任务相关的状态文件移动到 `.forge/archive/<date>-<topic>/`：

归档范围：

| 来源 | 归档条件 |
|------|---------|
| `.forge/decisions/<topic>*` | 如果存在 |
| `.forge/specs/<topic>/` | 如果存在 |
| `.forge/plans/<topic>*` | 如果存在 |
| `.forge/findings/<topic>*` | 如果存在 |
| `.forge/progress/<topic>*` | 如果存在 |
| `.forge/reviews/<topic>*` | 如果存在 |
| `.forge/debug/<topic>*` | 如果存在 |

**归档目录命名**：`.forge/archive/YYYY-MM-DD-<topic>/`

**归档方式**：移动（不是复制）。归档后原位置不再保留这些文件。

### Step 3：重置 status.md

将 `.forge/status.md` 重置为初始状态：

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

### 3.1 无 `.forge/` 目录

```
⚠️ 未检测到 .forge/ 目录。请先运行 forge init 初始化项目。
```

### 3.2 无进行中的任务

```
ℹ️ 当前没有进行中的任务，无需中止。
```

### 3.3 用户取消中止

用户回复 `n` 时：

```
ℹ️ 已取消中止。当前任务继续。
```

### 3.4 归档目录已存在

如果 `.forge/archive/YYYY-MM-DD-<topic>/` 已存在（同一天中止过同名任务），追加序号：

```
.forge/archive/YYYY-MM-DD-<topic>-2/
```

---

## 4. 注意事项

- **abort 不会撤销代码变更**。如果 build 阶段已经修改了项目代码并提交了 commit，这些 commit 不会被回滚。abort 只清理 `.forge/` 状态文件。
- **abort 不会删除知识**。`.forge/knowledge/` 目录不受 abort 影响——已沉淀的知识是项目资产，不随任务中止而丢失。
- **归档文件可以手动恢复**。如果中止后发现需要恢复，从 `.forge/archive/` 手动移回即可。
