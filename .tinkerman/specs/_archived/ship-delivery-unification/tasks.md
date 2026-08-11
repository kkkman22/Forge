---
status: approved
feature: ship-delivery-unification
layout: tasks
created: 2026-04-29
spec_ref: ".tinkerman/specs/ship-delivery-unification/requirements.md"
---

# Implementation Plan: Ship 交付引擎统一化

## Overview

统一 Ship 阶段的 Git 操作层，将交付级操作纳入 `git-transaction.ts` 安全管道和 `OrchestratorEffect` 体系。实现顺序：先扩展底层命令构建器，再扩展 Effect 类型和执行器，然后处理配置和 Worktree 协调，最后集成到 Ship SKILL。

## Tasks

- [x] 1. 扩展 `git-transaction.ts` — 交付级命令构建器
  - [x] 1.1 实现 `validateBranchName()` 校验函数
    - 检查分支名是否包含 shell 元字符（调用 `containsShellMetacharacters()`）
    - 检查分支名经过 `sanitizeBranchName()` 后是否与原值不同（说明含非法字符）
    - 任一检查失败时抛出 `ForgeError`，包含具体的非法字符信息
    - _Requirements: 1.5, 1.6, 6.1_

  - [x] 1.2 实现 `buildCheckoutCommand(branch: string): GitCommand`
    - 调用 `validateBranchName(branch)` 校验
    - 返回 `{ executable: "git", args: ["checkout", branch] }`
    - _Requirements: 1.2, 6.1_

  - [x] 1.3 实现 `buildMergeCommand(branch: string, noFf: boolean): GitCommand`
    - 调用 `validateBranchName(branch)` 校验
    - `noFf=true` 时 args 为 `["merge", "--no-ff", branch]`
    - `noFf=false` 时 args 为 `["merge", branch]`
    - _Requirements: 1.1, 6.1_

  - [x] 1.4 实现 `buildBranchDeleteCommand(branch: string, force: boolean): GitCommand`
    - 调用 `validateBranchName(branch)` 校验
    - `force=true` 时 args 为 `["branch", "-D", branch]`
    - `force=false` 时 args 为 `["branch", "-d", branch]`
    - _Requirements: 1.3, 6.1_

  - [x] 1.5 实现 `buildPushCommand(remote: string, branch: string, setUpstream: boolean): GitCommand`
    - 调用 `validateBranchName(branch)` 校验
    - 对 `remote` 参数调用 `containsShellMetacharacters()` 检查
    - `setUpstream=true` 时 args 为 `["push", "-u", remote, branch]`
    - `setUpstream=false` 时 args 为 `["push", remote, branch]`
    - _Requirements: 1.4, 6.1_

  - [x] 1.6 实现 `buildMergeAbortCommand(): GitCommand`
    - 返回 `{ executable: "git", args: ["merge", "--abort"] }`
    - 无参数校验（固定命令）
    - _Requirements: 5.5, 6.1_

  - [x] 1.7 编写属性测试：shell 元字符拒绝 (Property 1)
    - 使用 fast-check 生成包含 shell 元字符的字符串
    - 断言所有命令构建器对这些输入抛出错误
    - 200 次迭代
    - _Requirements: 1.5, 1.6_

  - [x] 1.8 编写属性测试：force 标志正确性 (Property 6)
    - 使用 fast-check 生成合法分支名和布尔值
    - 断言 `buildBranchDeleteCommand` 的 args 包含正确的 `-d` 或 `-D`
    - 200 次迭代
    - _Requirements: 1.3_

  - [x] 1.9 编写单元测试：各命令构建器的正常路径
    - 测试 `buildCheckoutCommand("main")` → `["checkout", "main"]`
    - 测试 `buildMergeCommand("feature", true)` → `["merge", "--no-ff", "feature"]`
    - 测试 `buildBranchDeleteCommand("feature", false)` → `["branch", "-d", "feature"]`
    - 测试 `buildPushCommand("origin", "feature", true)` → `["push", "-u", "origin", "feature"]`
    - 测试 `buildMergeAbortCommand()` → `["merge", "--abort"]`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.5_

- [x] 2. 扩展 `OrchestratorEffect` 类型 — Ship 效果
  - [x] 2.1 在 `src/loop-types.ts` 的 `OrchestratorEffect` 联合类型中新增三种 Ship 效果
    - `ship_merge`: `{ type: "ship_merge"; targetBranch: string; featureBranch: string }`
    - `ship_push_pr`: `{ type: "ship_push_pr"; remote: string; branch: string; title: string; body: string }`
    - `ship_discard`: `{ type: "ship_discard"; branch: string }`
    - 确保现有类型不受影响
    - _Requirements: 2.1, 2.2, 2.3, 7.3_

  - [x] 2.2 在 `src/effect-executor.ts` 的 `executeEffect()` 中实现 `ship_merge` case
    - 按顺序执行：`buildCheckoutCommand` → `buildMergeCommand(branch, true)` → `buildBranchDeleteCommand(branch, false)`
    - Merge 失败时执行 `buildMergeAbortCommand()` 恢复，然后抛出 `ForgeError`
    - Checkout 失败时直接抛出，不执行后续操作
    - _Requirements: 2.4, 2.5, 5.1, 5.2_

  - [x] 2.3 在 `src/effect-executor.ts` 的 `executeEffect()` 中实现 `ship_push_pr` case
    - 执行 `buildPushCommand(remote, branch, true)`
    - Push 成功后执行 `gh pr create`（通过 `execFileSync("gh", [...])`)
    - Push 失败时抛出 `ForgeError`，不执行 PR 创建
    - PR 创建失败时输出警告日志，不抛出错误（保留 push 结果）
    - _Requirements: 2.4, 5.3, 5.4_

  - [x] 2.4 在 `src/effect-executor.ts` 的 `executeEffect()` 中实现 `ship_discard` case
    - 按顺序执行：`buildCheckoutCommand("main")` → `buildBranchDeleteCommand(branch, true)`
    - _Requirements: 2.4, 2.6_

  - [x] 2.5 编写属性测试：Merge 失败后 abort 恢复 (Property 2)
    - Mock `execFileSync` 使 merge 命令抛出错误
    - 断言 `merge --abort` 被调用
    - 断言 `branch -d` 未被调用
    - 断言抛出 `ForgeError`
    - _Requirements: 5.1, 5.2_

  - [x] 2.6 编写单元测试：三种 Ship 效果的正常和异常路径
    - `ship_merge` 成功：验证 checkout → merge → delete 调用顺序
    - `ship_merge` merge 失败：验证 abort 调用和错误抛出
    - `ship_push_pr` 成功：验证 push → gh pr create 调用
    - `ship_push_pr` PR 失败：验证 push 保留 + 警告日志
    - `ship_discard`：验证 checkout → force delete 调用
    - _Requirements: 2.4, 2.5, 2.6, 5.1, 5.3, 5.4_

- [x] 3. Checkpoint — 底层模块完成
  - 运行 `npm run check` 确保所有测试通过
  - 确认现有 `commit`/`rollback` 效果的测试未受影响

- [x] 4. 扩展 `execution-mode.ts` — Autonomous 配置化
  - [x] 4.1 新增 `DeliveryMethod` 类型和 `parseShipDefaultMethod()` 纯函数
    - 定义 `DeliveryMethod = "merge" | "push-pr" | "keep-branch" | "prompt"`
    - 实现解析逻辑：有效值 → 对应枚举，无效值 → `keep-branch` + 警告
    - `undefined` 输入 → `keep-branch`（向后兼容）
    - _Requirements: 3.1, 3.2, 3.6, 6.3_

  - [x] 4.2 扩展 `resolveConfirmation()` 支持 `configOverride` 参数
    - 新增可选第三参数 `configOverride?: Partial<Record<ConfirmationPoint, string>>`
    - 当 `configOverride` 提供且包含当前 `point` 的值时，使用配置值替代 `AUTONOMOUS_PRESETS`
    - 当 `point === "ship_method"` 且 preset 为 `"prompt"` 时，返回 `{ action: "wait_for_user" }`
    - 不修改 `AUTONOMOUS_PRESETS` 常量（保持向后兼容）
    - _Requirements: 3.3, 3.4, 3.5, 7.5_

  - [x] 4.3 编写属性测试：配置解析安全回退 (Property 4)
    - 使用 fast-check 生成任意字符串
    - 断言 `parseShipDefaultMethod()` 永远返回有效的 `DeliveryMethod`，不抛出错误
    - 200 次迭代
    - _Requirements: 3.2, 3.6_

  - [x] 4.4 编写属性测试：无配置时向后兼容 (Property 5)
    - 断言 `resolveConfirmation("autonomous", "ship_method")` 无 configOverride 时返回 `{ action: "auto", preset: "keep branch" }`
    - 断言所有其他 ConfirmationPoint 的行为不变
    - _Requirements: 7.1, 7.5_

  - [x] 4.5 编写单元测试：配置解析和确认决策
    - `parseShipDefaultMethod("merge")` → `{ method: "merge" }`
    - `parseShipDefaultMethod("invalid")` → `{ method: "keep-branch", warning: "..." }`
    - `parseShipDefaultMethod(undefined)` → `{ method: "keep-branch" }`
    - `resolveConfirmation("autonomous", "ship_method", { ship_method: "merge" })` → `{ action: "auto", preset: "merge" }`
    - `resolveConfirmation("autonomous", "ship_method", { ship_method: "prompt" })` → `{ action: "wait_for_user" }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 5. 扩展 `worktree-manager.ts` — Worktree 清理协调
  - [x] 5.1 扩展 `decideWorktreeCleanup()` 新增 `shipOption` 参数
    - 新增可选第二参数 `shipOption?: "merge" | "push-pr" | "keep-branch" | "discard"`
    - `merge` / `discard` → `{ action: "remove", reason: "..." }`（不涉及分支操作）
    - `push-pr` / `keep-branch` → `{ action: "preserve", reason: "..." }`
    - `undefined` → 保持原有 commitCount 逻辑
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.2_

  - [x] 5.2 编写属性测试：无重复分支删除 (Property 3)
    - 使用 fast-check 生成所有 shipOption 和 commitCount 组合
    - 断言 `merge` 和 `discard` 选项下 action 为 `remove`（worktree 清理不再涉及分支删除）
    - 断言 `push-pr` 和 `keep-branch` 选项下 action 为 `preserve`
    - 200 次迭代
    - _Requirements: 4.6_

  - [x] 5.3 编写单元测试：各 shipOption 值的决策
    - 测试 `decideWorktreeCleanup(5, "merge")` → `{ action: "remove", ... }`
    - 测试 `decideWorktreeCleanup(5, "keep-branch")` → `{ action: "preserve", ... }`
    - 测试 `decideWorktreeCleanup(0)` → `{ action: "remove", ... }`（原有行为）
    - 测试 `decideWorktreeCleanup(3)` → `{ action: "preserve", ... }`（原有行为）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 6. 更新 Ship SKILL 文档
  - [x] 6.1 更新 `skills/forge-ship/SKILL.md` 中的 Git 命令描述
    - 将直接的 bash 命令替换为对 Effect 体系的引用
    - 说明交付操作通过 `OrchestratorEffect` → `EffectExecutor` → `git-transaction.ts` 管道执行
    - 更新错误处理部分，引用 `merge --abort` 恢复机制
    - _Requirements: 2.4, 5.1_

  - [x] 6.2 在 SKILL.md 中新增 autonomous 配置说明
    - 说明 `ship_default_method` 配置项的用法和有效值
    - 说明 `"prompt"` 值可以在 autonomous 模式下强制交互
    - _Requirements: 3.1, 3.3_

- [x] 7. 集成测试与回归验证
  - [x] 7.1 运行完整测试套件 `npm run check`
    - 确认所有新增测试通过
    - 确认所有现有测试不受影响（特别是 `ship.test.ts`、`effect-executor.test.ts`、`sdk-driver.property.test.ts`）
    - _Requirements: 7.2, 7.3, 7.4_

  - [x] 7.2 验证 `loop-index.ts` 导出
    - 确认新增的类型和函数通过 `loop-index.ts` 正确导出
    - 确认 TypeDoc 文档生成不报错：`npm run docs`
    - _Requirements: 7.3, 7.4_

  - [x] 7.3 验证分发包同步：`bash scripts/build-dist.sh`
    - 确认 `dist/` 目录包含新增模块的编译产物
    - _Requirements: 7.3_

## Notes

- 所有新增命令构建器遵循项目现有模式：纯函数，返回 `GitCommand` 描述符，不执行 I/O
- `gh pr create` 是唯一不走 `GitCommand` 管道的外部命令，因为它不是 git 命令；但参数仍通过 args 数组传递避免注入
- `validateBranchName()` 采用"拒绝"策略而非"清理"策略，因为交付阶段的分支名应该在创建时已经被清理过
- Ship 效果不经过 orchestrator 状态机（不改变 `OrchestratorState`），它们是终态操作，直接由 Ship SKILL 生成并交给 EffectExecutor 执行
- `resolveConfirmation()` 的签名扩展使用可选参数，所有现有调用点无需修改
