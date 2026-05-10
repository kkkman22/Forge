---
feature: "branch-isolation-recommendation"
status: "locked"
date: "2026-05-10"
---

## 目的

为 `/forge build` 的 Branch Gate 增加智能推荐逻辑：根据工作树状态、已有 worktree 数量、任务档位，向开发者推荐使用 feature 分支或 worktree 隔离开发。解决当前 Branch Gate 在脏工作树时只能阻断、无法引导用户选择合适隔离方式的问题。

## 需求

### 需求 1：Branch Gate 推荐决策

Branch Gate 检测到当前分支不匹配时，不再仅阻断，而是基于条件矩阵推荐隔离方式，并通过 `AskUserQuestion` 让开发者选择。

**场景 1**：当工作树干净且无其他活跃 worktree 且任务为 Light/Standard tier，Branch Gate 推荐创建 feature 分支。

```
Given 开发者运行 /forge build
And 工作树干净（git status --porcelain 为空）
And 活跃 worktree 数量为 0
And 任务档位为 Light 或 Standard
When Branch Gate 检测当前分支不匹配
Then 推荐选项为"创建 feature 分支"（默认）
And 提供备选"创建 worktree"
```

**场景 2**：当工作树脏（有未提交变更），Branch Gate 推荐创建 worktree 以避免 stash 丢失上下文。

```
Given 开发者运行 /forge build
And 工作树有未提交变更（git status --porcelain 非空）
When Branch Gate 检测当前分支不匹配
Then 推荐选项为"创建 worktree"（默认）
And 提供备选"stash + feature 分支"
```

**场景 3**：当已有 ≥1 个活跃 worktree，Branch Gate 推荐继续使用 worktree 保持并行开发一致性。

```
Given 开发者运行 /forge build
And 活跃 worktree 数量 ≥ 1
When Branch Gate 检测当前分支不匹配
Then 推荐选项为"创建 worktree"（默认）
And 提供备选"stash + feature 分支"
```

**场景 4**：当任务为 Full tier（新服务/db/auth），推荐 worktree 以提供更强的隔离。

```
Given 开发者运行 /forge build
And 任务档位为 Full
When Branch Gate 检测当前分支不匹配
Then 推荐选项为"创建 worktree"（默认）
And 提供备选"创建 feature 分支"
```

**场景 5**：当活跃 worktree 数量已达上限（默认 3），回退推荐 feature 分支。

```
Given 开发者运行 /forge build
And 活跃 worktree 数量 ≥ maxConcurrent（默认 3）
When Branch Gate 检测当前分支不匹配
Then 推荐选项为"stash + feature 分支"（默认）
And 说明原因"worktree 并发上限已满"
```

### 需求 2：推荐函数（纯函数）

提供纯函数 `recommendIsolationStrategy`，输入当前状态，输出推荐结果。不执行 I/O。

**场景 6**：当传入 dirtyTree=true, activeWorktrees=0, tier="standard"，函数返回 `{ primary: "worktree", secondary: "stash-feature", reason: "工作树有未提交变更" }`。

```
Given dirtyTree 为 true
And activeWorktrees 为 0
And tier 为 "standard"
When 调用 recommendIsolationStrategy
Then 返回 primary 为 "worktree"
And 返回 secondary 为 "stash-feature"
And reason 包含 "未提交变更"
```

### 需求 3：Branch Gate 集成

修改 `skills/forge-build/references/branch-gate.md`，在 Branch State Table 的"Other"行中引用推荐逻辑，替代当前的直接阻断。

**场景 7**：Branch Gate 检测到分支不匹配且不在推荐白名单中时，调用推荐函数并展示 AskUserQuestion。

```
Given Branch Gate 检测当前分支不匹配
And 不在匹配豁免列表中
When 执行 Branch Gate
Then 调用 recommendIsolationStrategy
And 通过 AskUserQuestion 展示推荐选项
And 用户选择后执行对应的分支创建操作
```

### 需求 4：Topic 兼容 Jira 风格

确保推荐逻辑对 topic 格式无感知——topic 可以是语义名（`user-auth`）或 Jira ticket 号（`CH-3456`），推荐逻辑只看状态不看 topic 内容。

**场景 8**：当 topic 为 Jira ticket 号格式时，推荐逻辑行为与语义 topic 完全一致。

```
Given topic 为 "CH-3456"
And dirtyTree 为 false
And activeWorktrees 为 0
And tier 为 "standard"
When 调用 recommendIsolationStrategy
Then 返回 primary 为 "feature"
And 分支名为 "feature/CH-3456"
```

## 场景汇总

| ID | Scenario | Requirement |
|----|----------|-------------|
| S1 | 干净树 + 无 worktree + Light/Standard → 推荐 feature 分支 | 需求 1 |
| S2 | 脏工作树 → 推荐 worktree | 需求 1 |
| S3 | 已有活跃 worktree → 推荐 worktree | 需求 1 |
| S4 | Full tier → 推荐 worktree | 需求 1 |
| S5 | worktree 达上限 → 回退 feature 分支 | 需求 1 |
| S6 | 纯函数输入输出验证 | 需求 2 |
| S7 | Branch Gate 集成 AskUserQuestion | 需求 3 |
| S8 | Jira ticket 号 topic 兼容 | 需求 4 |

## Current State

### Related Modules

| Module | File | Role |
|--------|------|------|
| Branch Gate | `skills/forge-build/references/branch-gate.md:9-14` | 分支状态表，定义 auto-switch 逻辑 |
| Branch Lifecycle | `src/branch-lifecycle.ts:41-59` | `checkBranchTopicGate` 做 topic 匹配 |
| Worktree Manager | `src/worktree-manager.ts:153-158` | `canCreateWorktree` 并发检查 |
| Run Manager | `src/run-manager.ts:340-496` | `setupWorktree` 创建 worktree |
| Build Gate | `src/build.ts:57-72` | `checkBuildGate` 前置检查 |

### Structure Overview

当前 Branch Gate（`branch-gate.md:9-14`）是静态状态表：

```
| On matching feature/<topic>        | ✅ Pass                    |
| Other, branch exists               | git checkout               |
| Other, branch missing              | git checkout -b            |
| feature/<topic> mismatch           | 🚫 Block                   |
```

问题：第四行（mismatch）直接阻断，不给用户选择。第一行到第三行的 auto-switch 不检查工作树是否干净（`branch-gate.md:7` 注明 "Auto-switch requires clean working tree"），但实际阻断时没有推荐替代方案。

## Proposed Change

### To Change

- `src/branch-lifecycle.ts`：新增 `recommendIsolationStrategy` 纯函数
- `skills/forge-build/references/branch-gate.md`：Branch State Table 增加"推荐"行，引用推荐函数
- `src/worktree-manager.ts`：新增 `countActiveWorktrees` 辅助函数（从 `run-manager.ts` 提取 worktree 计数逻辑）

### Explicitly Unchanged

- `checkBranchTopicGate` 函数签名和行为不变
- `canCreateWorktree` 函数签名和行为不变
- `setupWorktree` 函数签名和行为不变
- `/loop` 自主循环的 worktree 创建路径不变
- Spec Gate、Plan Gate、Dir Integrity 检查不变

## 不做什么

- 不改变 `/loop` 自主循环的 worktree 自动创建逻辑
- 不改变 worktree 并发上限（保持 `DEFAULT_MAX_CONCURRENT = 3`）
- 不引入新的 branch 命名格式（仍为 `feature/<topic>` 或 `forge/<topic>`）
- 不在推荐逻辑中做 topic 格式验证（Jira 号、语义名都接受）
- 不改变 ship 阶段的分支生命周期管理

## Reversibility

### Rollback Checklist

1. 删除 `src/branch-lifecycle.ts` 中的 `recommendIsolationStrategy` 函数
2. 还原 `skills/forge-build/references/branch-gate.md` 为静态状态表
3. 删除 `src/worktree-manager.ts` 中的 `countActiveWorktrees` 函数

### Mount Points

- `branch-gate.md` 被 `skills/forge-build/SKILL.md:43` 引用
- `recommendIsolationStrategy` 被 Branch Gate SKILL 调用
- `countActiveWorktrees` 被 Branch Gate 和 `recommendIsolationStrategy` 调用

## 反漂移声明

- **主目标**：Branch Gate 在分支不匹配时推荐最优隔离方式，消除"只阻断不引导"的体验断点
- **非目标代理信号**：不扩展为完整的 VCS 工作流管理器、不引入 stash 管理功能、不替代用户手动 git 操作
- **验证材料角色**：纯函数单元测试覆盖所有决策矩阵条件 + Branch Gate 集成测试验证 AskUserQuestion 调用

## Delta

### New

- `recommendIsolationStrategy` 纯函数
- `countActiveWorktrees` 辅助函数
- Branch Gate 推荐行逻辑

### Modified

- `skills/forge-build/references/branch-gate.md` — Branch State Table 扩展

### Unchanged

- `checkBranchTopicGate`、`canCreateWorktree`、`setupWorktree`
- `/loop` 路径的 worktree 管理
- ship 阶段分支生命周期
