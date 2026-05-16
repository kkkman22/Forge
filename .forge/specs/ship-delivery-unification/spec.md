---
status: locked
contract_legacy: true
created: "2026-04-29"
locked: "2026-04-29"
source: ".kiro/specs/ship-delivery-unification/requirements.md"
---

# Spec: Ship 交付引擎统一化

> 来源: `.kiro/specs/ship-delivery-unification/requirements.md`

## 需求清单

### R1: 交付级 Git 命令构建器
- `git-transaction.ts` 新增 `buildCheckoutCommand`、`buildMergeCommand`、`buildBranchDeleteCommand`、`buildPushCommand`、`buildMergeAbortCommand` 纯函数
- 所有构建器返回 `GitCommand` 描述符，通过 `execFileSync` 执行，避免 shell 注入
- 分支名参数经过 `validateBranchName()` 校验，含非法字符时抛出错误
- 分支名参数经过 `containsShellMetacharacters()` 检查

### R2: Ship 交付效果类型
- `OrchestratorEffect` 新增 `ship_merge`、`ship_push_pr`、`ship_discard` 三种效果
- `EffectExecutor` 实现三种效果的执行逻辑，内部使用 R1 的命令构建器
- `ship_merge`: checkout → merge --no-ff → branch -d
- `ship_discard`: checkout main → branch -D

### R3: Autonomous 模式交付策略可配置化
- `.forge/config.md` 支持 `ship_default_method` 配置项（merge/push-pr/keep-branch/prompt）
- 未配置时默认 `keep-branch`（向后兼容）
- `"prompt"` 值可覆盖 autonomous 行为，强制等待用户输入
- `resolveConfirmation()` 支持可选的配置覆盖参数

### R4: Worktree 清理与 Ship 选项协调
- `decideWorktreeCleanup()` 新增 `shipOption` 可选参数
- merge/discard → 跳过分支删除（Ship 已处理）
- push-pr/keep-branch → 保留分支
- undefined → 保持原有 commitCount 逻辑

### R5: Ship 交付操作的错误恢复
- merge 失败 → `merge --abort` 恢复 → 不删除分支
- push 失败 → 不创建 PR
- PR 创建失败 → 保留 push 结果（不回滚）
- 所有失败通过 `ForgeError` 结构化报告

### R6: 纯函数设计与可测试性
- 所有命令构建器为纯函数
- 配置解析为纯函数
- Worktree 决策扩展保持纯函数特性

### R7: 向后兼容性
- 未配置 `ship_default_method` 时 autonomous 保持 "keep branch"
- 现有 `OrchestratorEffect` 类型不受影响
- 现有 `git-transaction.ts` 函数签名不变
- `AUTONOMOUS_PRESETS` 默认值不变
