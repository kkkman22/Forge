---
status: archived
archived_reason: "核心基础设施 git-transaction.ts 已退役，交付逻辑简化到 src/ship.ts"
archived_replacement: "src/ship.ts 纯函数"
feature: ship-delivery-unification
layout: requirements
created: 2026-04-29
tier: standard
---
# 需求文档：Ship 交付引擎统一化

## 简介

Forge Ship 阶段的代码提交行为在不同执行模式和交付选项之间存在不一致性。具体表现为：(1) 交付级 Git 操作（merge、push、branch delete）未经过 `git-transaction.ts` 的安全管道，与迭代级操作存在安全层不对称；(2) Autonomous 模式硬编码为 "keep branch"，缺乏可配置性；(3) Worktree 清理逻辑与 Ship 四选项之间缺乏协调，可能导致重复或冲突的分支删除操作。本 spec 旨在统一 Ship 交付引擎的 Git 操作层，消除行为不一致，并增强安全性。

## 术语表

- **Ship Gate**：Ship 阶段的三道门禁检查（Review、Test、Progress），全部通过后才允许交付
- **交付选项（Delivery Option）**：门禁通过后的四种交付方式——合并到主分支、推送并创建 PR、保留分支、丢弃
- **GitCommand**：`git-transaction.ts` 中定义的安全命令描述符，包含 `executable: "git"` 和 `args: string[]`，通过 `execFileSync` 执行，避免 shell 注入
- **Worktree 清理**：运行结束后根据 commitCount 决定保留或删除 Git Worktree 的逻辑
- **Autonomous 模式**：自动执行模式，所有确认点使用预设策略，不等待用户输入
- **Interactive 模式**：交互执行模式，确认点等待用户输入

## 需求

### 需求 1：交付级 Git 命令构建器

**用户故事：** 作为开发者，我希望 Ship 阶段的所有 Git 操作都经过与迭代级操作相同的安全管道，以防止 shell 注入和命令构造错误。

#### 验收标准

1. `git-transaction.ts` SHALL 新增 `buildMergeCommand(branch: string, noFf: boolean)` 纯函数，返回 `GitCommand` 描述符
2. `git-transaction.ts` SHALL 新增 `buildCheckoutCommand(branch: string)` 纯函数，返回 `GitCommand` 描述符
3. `git-transaction.ts` SHALL 新增 `buildBranchDeleteCommand(branch: string, force: boolean)` 纯函数，返回 `GitCommand` 描述符，`force=true` 时使用 `-D`，`force=false` 时使用 `-d`
4. `git-transaction.ts` SHALL 新增 `buildPushCommand(remote: string, branch: string, setUpstream: boolean)` 纯函数，返回 `GitCommand` 描述符
5. FOR ALL 新增命令构建器，分支名参数 SHALL 经过 `sanitizeBranchName()` 校验，包含非法字符时 SHALL 抛出错误而非静默清理
6. FOR ALL 新增命令构建器，分支名参数 SHALL 经过 `containsShellMetacharacters()` 检查，包含 shell 元字符时 SHALL 抛出错误

### 需求 2：Ship 交付效果类型

**用户故事：** 作为开发者，我希望 Ship 的交付操作以 Effect 描述符形式表达，与现有的 commit/rollback 效果保持一致的架构风格。

#### 验收标准

1. `OrchestratorEffect` 类型 SHALL 新增 `ship_merge` 效果：`{ type: "ship_merge"; targetBranch: string; featureBranch: string }`
2. `OrchestratorEffect` 类型 SHALL 新增 `ship_push_pr` 效果：`{ type: "ship_push_pr"; remote: string; branch: string; title: string; body: string }`
3. `OrchestratorEffect` 类型 SHALL 新增 `ship_discard` 效果：`{ type: "ship_discard"; branch: string }`
4. `EffectExecutor` SHALL 实现对三种新效果类型的执行逻辑，内部使用需求 1 中的命令构建器
5. `ship_merge` 效果执行 SHALL 按顺序执行：checkout targetBranch → merge --no-ff featureBranch → branch -d featureBranch
6. `ship_discard` 效果执行 SHALL 按顺序执行：checkout main → branch -D branch

### 需求 3：Autonomous 模式交付策略可配置化

**用户故事：** 作为用户，我希望在 autonomous 模式下可以配置默认的交付方式，而不是被硬编码为 "keep branch"。

#### 验收标准

1. `.tinkerman/config.md` SHALL 支持 `ship_default_method` 配置项，可选值为 `merge`、`push-pr`、`keep-branch`、`prompt`
2. WHEN `ship_default_method` 未配置时，autonomous 模式 SHALL 默认使用 `keep-branch`（保持当前行为，向后兼容）
3. WHEN `ship_default_method` 配置为 `prompt` 时，autonomous 模式在 ship 阶段 SHALL 等待用户输入（覆盖 autonomous 预设）
4. WHEN `ship_default_method` 配置为 `merge` 或 `push-pr` 时，autonomous 模式 SHALL 自动执行对应的交付操作
5. `resolveConfirmation()` 函数 SHALL 接受可选的配置覆盖参数，当 `ship_method` 确认点有配置覆盖时使用配置值而非硬编码预设
6. WHEN `ship_default_method` 配置值无效时，SHALL 回退到 `keep-branch` 并输出警告

### 需求 4：Worktree 清理与 Ship 选项协调

**用户故事：** 作为开发者，我希望 Worktree 清理逻辑能感知 Ship 的交付选项，避免重复或冲突的分支操作。

#### 验收标准

1. `decideWorktreeCleanup()` SHALL 新增 `shipOption` 可选参数，类型为 `"merge" | "push-pr" | "keep-branch" | "discard" | undefined`
2. WHEN `shipOption` 为 `merge` 时，worktree 清理 SHALL 跳过分支删除（因为 ship_merge 效果已经删除了分支）
3. WHEN `shipOption` 为 `discard` 时，worktree 清理 SHALL 跳过分支删除（因为 ship_discard 效果已经删除了分支）
4. WHEN `shipOption` 为 `push-pr` 或 `keep-branch` 时，worktree 清理 SHALL 保留分支（分支仍在使用中）
5. WHEN `shipOption` 为 `undefined`（非 ship 阶段的运行结束）时，SHALL 保持当前行为（基于 commitCount 决定）
6. FOR ALL ship 选项与 worktree 清理的组合，不得出现对同一分支的重复删除操作

### 需求 5：Ship 交付操作的错误恢复

**用户故事：** 作为开发者，我希望 Ship 交付操作失败时能安全回退，不留下半完成的状态。

#### 验收标准

1. WHEN `ship_merge` 效果中 merge 操作失败（如冲突）时，SHALL 执行 `git merge --abort` 恢复到 merge 前状态
2. WHEN `ship_merge` 效果中 checkout 失败时，SHALL 不执行后续的 merge 和 branch delete
3. WHEN `ship_push_pr` 效果中 push 失败时，SHALL 不执行 PR 创建，并输出具体错误信息
4. WHEN `ship_push_pr` 效果中 PR 创建失败（如 gh CLI 未安装）时，push 结果 SHALL 保留（不回滚 push）
5. `git-transaction.ts` SHALL 新增 `buildMergeAbortCommand()` 纯函数，返回 `git merge --abort` 的 `GitCommand` 描述符
6. FOR ALL ship 效果执行失败，SHALL 通过 `ForgeError` 抛出包含操作类型和失败原因的结构化错误

### 需求 6：纯函数设计与可测试性

**用户故事：** 作为开发者，我希望所有新增模块遵循项目的纯函数设计模式，便于属性测试验证。

#### 验收标准

1. 需求 1 中的所有命令构建器 SHALL 为纯函数：接受参数，返回 `GitCommand`，无副作用
2. 需求 4 中的 `decideWorktreeCleanup()` 扩展 SHALL 保持纯函数特性
3. 需求 3 中的配置解析 SHALL 为纯函数：接受配置字符串，返回交付方式枚举值
4. FOR ALL 新增纯函数，SHALL 可通过属性测试验证其不变量

### 需求 7：向后兼容性

**用户故事：** 作为现有用户，我希望新功能不破坏现有的 Ship 行为和 Git 操作。

#### 验收标准

1. WHEN `.tinkerman/config.md` 中未配置 `ship_default_method` 时，autonomous 模式 SHALL 保持 "keep branch" 行为
2. WHEN 未使用 worktree 模式时，Ship 四选项的行为 SHALL 与当前完全一致
3. 现有的 `OrchestratorEffect` 类型（commit、rollback 等）SHALL 不受影响
4. 现有的 `git-transaction.ts` 函数签名 SHALL 不变
5. 现有的 `execution-mode.ts` 中 `AUTONOMOUS_PRESETS` 的默认值 SHALL 不变
