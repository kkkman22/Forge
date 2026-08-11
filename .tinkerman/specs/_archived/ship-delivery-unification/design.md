---
status: locked
feature: ship-delivery-unification
layout: design
created: 2026-04-29
---

# 设计文档：Ship 交付引擎统一化

## Overview

统一 Forge Ship 阶段的 Git 操作层，消除交付级操作与迭代级操作之间的安全层不对称。将 Ship 的四种交付选项（merge、push+PR、keep branch、discard）纳入 Effect 体系，通过 `git-transaction.ts` 的安全命令构建器执行。同时协调 Worktree 清理逻辑与 Ship 选项，避免重复分支操作，并将 autonomous 模式的交付策略从硬编码改为可配置。

### 设计目标

1. **安全层对称**：Ship 交付操作与迭代级 commit/rollback 使用相同的 `GitCommand` 管道，防止 shell 注入
2. **Effect 架构一致性**：交付操作以 `OrchestratorEffect` 描述符表达，由 `EffectExecutor` 统一执行
3. **Worktree 协调**：清理逻辑感知 Ship 选项，消除重复分支删除
4. **可配置 Autonomous**：交付策略从硬编码改为配置驱动，保持向后兼容
5. **纯函数核心**：所有命令构建和决策逻辑为纯函数，便于属性测试

## Architecture

### 高层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Ship SKILL 层                              │
│  门禁检查 → 选项展示 → 用户选择 / autonomous 预设             │
├─────────────────────────────────────────────────────────────┤
│                    Ship Effect 生成层                          │
│  buildShipEffect(option, context) → OrchestratorEffect       │
├─────────────────────────────────────────────────────────────┤
│                    EffectExecutor 执行层                       │
│  ship_merge │ ship_push_pr │ ship_discard                    │
│  (与 commit / rollback 同层执行)                              │
├─────────────────────────────────────────────────────────────┤
│                    git-transaction.ts 安全层                   │
│  buildMergeCommand │ buildCheckoutCommand │ buildPushCommand  │
│  buildBranchDeleteCommand │ buildMergeAbortCommand            │
│  (sanitizeBranchName + containsShellMetacharacters 校验)      │
├─────────────────────────────────────────────────────────────┤
│                    Worktree 协调层                             │
│  decideWorktreeCleanup(commitCount, shipOption?)              │
│  (感知 Ship 选项，避免重复分支操作)                             │
└─────────────────────────────────────────────────────────────┘
```

### 模块交互流程

```
/forge ship
    │
    ▼
Ship SKILL: 门禁检查 (checkShipGate)
    │ 通过
    ▼
resolveConfirmation(mode, "ship_method", configOverride?)
    │
    ├─ autonomous + config → 自动选择交付方式
    │   └─ parseShipDefaultMethod(configValue) → DeliveryMethod
    │
    └─ interactive → 等待用户选择 1-4
    │
    ▼
buildShipEffect(deliveryMethod, branchContext)
    │
    ├─ merge    → { type: "ship_merge", targetBranch: "main", featureBranch: "forge/xxx" }
    ├─ push-pr  → { type: "ship_push_pr", remote: "origin", branch: "forge/xxx", title, body }
    ├─ keep     → (无 effect，直接完成)
    └─ discard  → { type: "ship_discard", branch: "forge/xxx" }
    │
    ▼
EffectExecutor.executeEffect(shipEffect)
    │
    ├─ ship_merge:
    │   ├─ buildCheckoutCommand("main")        → execFileSync
    │   ├─ buildMergeCommand("forge/xxx", true) → execFileSync
    │   │   └─ 失败? → buildMergeAbortCommand() → execFileSync → throw ForgeError
    │   └─ buildBranchDeleteCommand("forge/xxx", false) → execFileSync
    │
    ├─ ship_push_pr:
    │   ├─ buildPushCommand("origin", "forge/xxx", true) → execFileSync
    │   │   └─ 失败? → throw ForgeError (不回滚 push)
    │   └─ gh pr create (外部命令，非 GitCommand)
    │
    └─ ship_discard:
        ├─ buildCheckoutCommand("main")              → execFileSync
        └─ buildBranchDeleteCommand("forge/xxx", true) → execFileSync
    │
    ▼
decideWorktreeCleanup(commitCount, shipOption)
    │
    ├─ shipOption = "merge"    → skip branch delete (已由 ship_merge 删除)
    ├─ shipOption = "discard"  → skip branch delete (已由 ship_discard 删除)
    ├─ shipOption = "push-pr"  → preserve branch
    ├─ shipOption = "keep"     → preserve branch
    └─ shipOption = undefined  → 原有逻辑 (commitCount > 0 ? preserve : remove)
```

## Components and Interfaces

### 1. 交付级 Git 命令构建器 (`src/git-transaction.ts` 扩展)

```typescript
// ---------------------------------------------------------------------------
// 新增：Ship 交付命令构建器
// ---------------------------------------------------------------------------

/**
 * 校验分支名安全性。
 * 如果分支名包含 shell 元字符或非法 Git 字符，抛出错误。
 * 与 sanitizeBranchName() 不同，此函数拒绝而非清理——交付操作
 * 不应静默修改分支名。
 */
function validateBranchName(branch: string): void;

/**
 * Build a `git checkout <branch>` command.
 */
function buildCheckoutCommand(branch: string): GitCommand;

/**
 * Build a `git merge [--no-ff] <branch>` command.
 */
function buildMergeCommand(branch: string, noFf: boolean): GitCommand;

/**
 * Build a `git branch -d|-D <branch>` command.
 * force=true → -D (force delete), force=false → -d (safe delete)
 */
function buildBranchDeleteCommand(branch: string, force: boolean): GitCommand;

/**
 * Build a `git push [-u] <remote> <branch>` command.
 */
function buildPushCommand(remote: string, branch: string, setUpstream: boolean): GitCommand;

/**
 * Build a `git merge --abort` command.
 * Used for error recovery when merge fails.
 */
function buildMergeAbortCommand(): GitCommand;
```

**设计决策**：
- 使用 `validateBranchName()` 而非 `sanitizeBranchName()` 进行校验——交付操作中分支名来自系统内部（由 `sanitizeBranchName` 在创建时已清理），如果此时仍包含非法字符说明有 bug，应该报错而非静默修改
- `buildPushCommand` 的 remote 参数也需要校验 shell 元字符
- 所有函数保持纯函数特性，不执行任何 I/O

### 2. Ship Effect 类型扩展 (`src/loop-types.ts`)

```typescript
// 在 OrchestratorEffect 联合类型中新增：

export type OrchestratorEffect =
  | { type: "schedule_iteration"; iterationNumber: number }
  | { type: "commit"; message: string }
  | { type: "rollback" }
  | { type: "start_backoff"; durationMs: number }
  | { type: "abort"; reason: string }
  | { type: "stop" }
  // ★ 新增：Ship 交付效果
  | { type: "ship_merge"; targetBranch: string; featureBranch: string }
  | { type: "ship_push_pr"; remote: string; branch: string; title: string; body: string }
  | { type: "ship_discard"; branch: string };
```

**设计决策**：
- Ship 效果与现有效果同层定义，保持类型系统的一致性
- `ship_push_pr` 包含 PR 的 title 和 body，由 Ship SKILL 层从 plan 中提取并传入
- `keep-branch` 选项不产生 effect（无 Git 操作），因此不需要对应的效果类型

### 3. EffectExecutor 扩展 (`src/effect-executor.ts`)

```typescript
// executeEffect() 的 switch 中新增三个 case：

case "ship_merge": {
  const { targetBranch, featureBranch } = effect;
  try {
    // Step 1: checkout target branch
    const checkoutCmd = buildCheckoutCommand(targetBranch);
    this.deps.execFileSync(checkoutCmd.executable, checkoutCmd.args);

    // Step 2: merge with --no-ff
    const mergeCmd = buildMergeCommand(featureBranch, true);
    this.deps.execFileSync(mergeCmd.executable, mergeCmd.args);
  } catch (mergeError) {
    // Merge failed (conflict) — abort merge to restore clean state
    try {
      const abortCmd = buildMergeAbortCommand();
      this.deps.execFileSync(abortCmd.executable, abortCmd.args);
    } catch { /* merge --abort failure is non-fatal */ }
    throw new ForgeError(`Ship merge failed: ${mergeError}`);
  }

  // Step 3: delete feature branch (safe delete, merge already done)
  const deleteCmd = buildBranchDeleteCommand(featureBranch, false);
  this.deps.execFileSync(deleteCmd.executable, deleteCmd.args);
  break;
}

case "ship_push_pr": {
  const { remote, branch, title, body } = effect;
  // Step 1: push to remote
  const pushCmd = buildPushCommand(remote, branch, true);
  this.deps.execFileSync(pushCmd.executable, pushCmd.args);

  // Step 2: create PR via gh CLI (not a GitCommand — external tool)
  // gh CLI failure does not rollback the push
  try {
    this.deps.execFileSync("gh", ["pr", "create", "--title", title, "--body", body]);
  } catch (prError) {
    this.deps.onLog(`⚠️ PR creation failed: ${prError}. Branch was pushed successfully.`);
    // Don't throw — push succeeded, PR can be created manually
  }
  break;
}

case "ship_discard": {
  const { branch } = effect;
  // Step 1: checkout main
  const checkoutCmd = buildCheckoutCommand("main");
  this.deps.execFileSync(checkoutCmd.executable, checkoutCmd.args);

  // Step 2: force delete branch
  const deleteCmd = buildBranchDeleteCommand(branch, true);
  this.deps.execFileSync(deleteCmd.executable, deleteCmd.args);
  break;
}
```

**设计决策**：
- `ship_merge` 失败时执行 `merge --abort` 恢复，确保不留下半完成状态
- `ship_push_pr` 中 PR 创建失败不回滚 push——push 是有价值的操作，用户可以手动创建 PR
- `ship_discard` 使用 force delete (`-D`)，因为丢弃操作已经过二次确认
- `gh pr create` 不走 `GitCommand` 管道，因为它不是 git 命令；但参数仍通过 args 数组传递，避免 shell 注入

### 4. Autonomous 模式配置扩展 (`src/execution-mode.ts`)

```typescript
// ---------------------------------------------------------------------------
// 新增：Ship 交付方式配置
// ---------------------------------------------------------------------------

/** Ship 交付方式 */
export type DeliveryMethod = "merge" | "push-pr" | "keep-branch" | "prompt";

/** 有效的 ship_default_method 配置值 */
const VALID_DELIVERY_METHODS: ReadonlySet<string> = new Set([
  "merge", "push-pr", "keep-branch", "prompt",
]);

/**
 * 解析 ship_default_method 配置值（纯函数）。
 *
 * 无效值回退到 "keep-branch" 并返回警告信息。
 */
export function parseShipDefaultMethod(
  value: string | undefined,
): { method: DeliveryMethod; warning?: string } {
  if (!value) {
    return { method: "keep-branch" };
  }
  const trimmed = value.trim().toLowerCase();
  if (VALID_DELIVERY_METHODS.has(trimmed)) {
    return { method: trimmed as DeliveryMethod };
  }
  return {
    method: "keep-branch",
    warning: `Invalid ship_default_method "${value}", falling back to "keep-branch". Valid: ${[...VALID_DELIVERY_METHODS].join(", ")}`,
  };
}

/**
 * 扩展 resolveConfirmation() 以支持配置覆盖。
 *
 * 当 configOverride 提供且确认点为 "ship_method" 时，
 * 使用配置值替代硬编码预设。
 */
export function resolveConfirmation(
  mode: ExecutionMode,
  point: ConfirmationPoint,
  configOverride?: Partial<Record<ConfirmationPoint, string>>,
): ConfirmationDecision {
  if (mode === "autonomous") {
    const preset = configOverride?.[point] ?? AUTONOMOUS_PRESETS[point];

    // "prompt" 覆盖 autonomous 行为，强制等待用户输入
    if (point === "ship_method" && preset === "prompt") {
      return { action: "wait_for_user" };
    }

    return { action: "auto", preset };
  }
  return { action: "wait_for_user" };
}
```

**设计决策**：
- `resolveConfirmation()` 签名扩展使用可选参数，保持向后兼容
- `"prompt"` 值允许 autonomous 模式在 ship 阶段回退到交互模式，适用于需要人工确认交付方式的场景
- 配置解析为纯函数，无效值安全回退而非抛错

### 5. Worktree 清理协调 (`src/worktree-manager.ts`)

```typescript
/**
 * 扩展后的 worktree 清理决策。
 *
 * 新增 shipOption 参数，当 Ship 阶段已经处理了分支操作时，
 * 避免 worktree 清理重复执行分支删除。
 */
export function decideWorktreeCleanup(
  commitCount: number,
  shipOption?: "merge" | "push-pr" | "keep-branch" | "discard",
): WorktreeDecision {
  // Ship 已处理分支的情况
  if (shipOption === "merge") {
    return {
      action: "remove",
      reason: "Ship merged and deleted branch; removing worktree only",
    };
  }
  if (shipOption === "discard") {
    return {
      action: "remove",
      reason: "Ship discarded branch; removing worktree only",
    };
  }
  if (shipOption === "push-pr" || shipOption === "keep-branch") {
    return {
      action: "preserve",
      reason: "Branch still in use (pushed/kept); preserving worktree",
    };
  }

  // 非 Ship 阶段：保持原有逻辑
  if (commitCount > 0) {
    return {
      action: "preserve",
      reason: `Worktree has ${commitCount} commit(s) to review and merge`,
    };
  }
  return {
    action: "remove",
    reason: "Worktree has no commits; removing to free resources",
  };
}
```

**设计决策**：
- `shipOption` 为可选参数，未传入时保持原有行为（向后兼容）
- `merge` 和 `discard` 返回 `action: "remove"` 但不执行分支删除（分支已被 Ship 效果删除）
- `push-pr` 和 `keep-branch` 返回 `action: "preserve"`，因为分支仍在使用中
- Worktree 清理层只负责 worktree 目录的保留/删除决策，不再涉及分支操作

## Data Models

### Ship Effect 示例

```typescript
// 选项 1：合并到主分支
const mergeEffect: OrchestratorEffect = {
  type: "ship_merge",
  targetBranch: "main",
  featureBranch: "forge/order-batch-export",
};

// 选项 2：推送并创建 PR
const pushPrEffect: OrchestratorEffect = {
  type: "ship_push_pr",
  remote: "origin",
  branch: "forge/order-batch-export",
  title: "feat: 实现订单批量导出功能",
  body: "## 变更摘要\n...",
};

// 选项 3：保留分支 — 无 effect

// 选项 4：丢弃
const discardEffect: OrchestratorEffect = {
  type: "ship_discard",
  branch: "forge/order-batch-export",
};
```

### 配置示例

```markdown
<!-- .tinkerman/config.md frontmatter -->
---
project: "MyProject"
ship_default_method: "push-pr"
---
```

### Worktree 清理决策矩阵

| Ship 选项 | commitCount | Worktree 决策 | 分支操作 |
|-----------|-------------|--------------|---------|
| merge | any | remove | 无（Ship 已删除） |
| push-pr | any | preserve | 无（分支在远程） |
| keep-branch | any | preserve | 无（分支保留） |
| discard | any | remove | 无（Ship 已删除） |
| undefined | > 0 | preserve | 无 |
| undefined | 0 | remove | 删除孤立分支 |

## Correctness Properties

### Property 1: 命令构建器 shell 安全性

*For any* string input containing shell metacharacters (backticks, `$(...)`, semicolons, pipes, etc.), all ship command builders SHALL throw an error rather than producing a `GitCommand`.

**Validates: Requirements 1.5, 1.6**

### Property 2: Merge 效果的原子性

*For any* `ship_merge` effect execution, if the merge step fails, the working directory SHALL be restored to pre-merge state (via `merge --abort`), and the feature branch SHALL NOT be deleted.

**Validates: Requirements 5.1, 5.2**

### Property 3: Worktree 清理无重复删除

*For any* combination of `shipOption` and `commitCount`, `decideWorktreeCleanup()` SHALL NOT return an action that would delete a branch already deleted by the Ship effect.

**Validates: Requirements 4.2, 4.3, 4.6**

### Property 4: 配置解析安全回退

*For any* string input to `parseShipDefaultMethod()`, the function SHALL always return a valid `DeliveryMethod` (never throw), and invalid inputs SHALL map to `"keep-branch"`.

**Validates: Requirements 3.2, 3.6**

### Property 5: 向后兼容——无配置时行为不变

*For any* call to `resolveConfirmation("autonomous", "ship_method")` without `configOverride`, the result SHALL be `{ action: "auto", preset: "keep branch" }`.

**Validates: Requirements 7.1, 7.5**

### Property 6: Branch delete 命令的 force 标志正确性

*For any* call to `buildBranchDeleteCommand(branch, force)`, when `force=true` the args SHALL contain `"-D"`, and when `force=false` the args SHALL contain `"-d"`.

**Validates: Requirements 1.3**

## Error Handling

| 错误类型 | 触发条件 | 处理策略 |
|---------|---------|---------|
| 分支名含 shell 元字符 | 命令构建时检测到 | 抛出 `ForgeError`，阻断操作 |
| Merge 冲突 | `git merge` 返回非零退出码 | 执行 `merge --abort`，抛出 `ForgeError` |
| Checkout 失败 | 工作目录有未提交变更 | 抛出 `ForgeError`，不执行后续操作 |
| Push 失败 | 远程不可达或权限不足 | 抛出 `ForgeError`，不创建 PR |
| PR 创建失败 | `gh` CLI 未安装或 API 错误 | 输出警告，保留 push 结果（不抛错） |
| 无效配置值 | `ship_default_method` 值不在有效集合中 | 回退到 `keep-branch`，输出警告 |
| `merge --abort` 失败 | merge 恢复时出错 | 静默忽略（best-effort 恢复） |

## Testing Strategy

### 属性测试

| 模块 | 属性测试 | 对应 Property |
|------|---------|-------------|
| `git-transaction.ts` | Shell 元字符拒绝 | Property 1 |
| `effect-executor.ts` | Merge 失败后 abort 恢复 | Property 2 |
| `worktree-manager.ts` | 无重复分支删除 | Property 3 |
| `execution-mode.ts` | 配置解析安全回退 | Property 4 |
| `execution-mode.ts` | 无配置时向后兼容 | Property 5 |
| `git-transaction.ts` | Force 标志正确性 | Property 6 |

### 单元测试

| 模块 | 测试场景 |
|------|---------|
| `git-transaction.ts` | `buildCheckoutCommand` 生成正确的 args |
| `git-transaction.ts` | `buildMergeCommand` 带/不带 `--no-ff` |
| `git-transaction.ts` | `buildBranchDeleteCommand` `-d` vs `-D` |
| `git-transaction.ts` | `buildPushCommand` 带/不带 `-u` |
| `git-transaction.ts` | `buildMergeAbortCommand` 生成 `merge --abort` |
| `git-transaction.ts` | `validateBranchName` 拒绝含元字符的分支名 |
| `effect-executor.ts` | `ship_merge` 成功路径：checkout → merge → delete |
| `effect-executor.ts` | `ship_merge` 失败路径：merge 冲突 → abort → throw |
| `effect-executor.ts` | `ship_push_pr` 成功路径：push → pr create |
| `effect-executor.ts` | `ship_push_pr` PR 失败路径：push 成功 + PR 失败 → 警告 |
| `effect-executor.ts` | `ship_discard` 路径：checkout → force delete |
| `execution-mode.ts` | `parseShipDefaultMethod` 各有效值 |
| `execution-mode.ts` | `parseShipDefaultMethod` 无效值回退 |
| `execution-mode.ts` | `resolveConfirmation` 带 configOverride |
| `execution-mode.ts` | `resolveConfirmation` "prompt" 覆盖 autonomous |
| `worktree-manager.ts` | `decideWorktreeCleanup` 各 shipOption 值 |
| `worktree-manager.ts` | `decideWorktreeCleanup` 无 shipOption 时保持原行为 |
| `ship.ts` | `checkShipGate` 现有测试不受影响（回归） |
