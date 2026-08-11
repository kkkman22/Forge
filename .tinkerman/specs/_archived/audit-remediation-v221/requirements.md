---
status: obsolete
status_note: Target architecture (sdk-driver.ts, orchestrator.ts, etc.) deliberately deleted by forge-loop-native-fusion (2026-06-01). Surviving fixes absorbed elsewhere.
feature: audit-remediation-v221
layout: requirements
created: 2026-04-28
tier: standard
---
# 需求文档 — v2.2.1 审计发现项修复

## 简介

本文档定义 Forge v2.2.1 上线审计发现的 25 项问题的修复需求。问题来源于 2026-04-27 上线前深度审核（第二轮）及功能逻辑自洽性审核，涵盖高风险 6 项、中风险 11 项、低风险 8 项。所有问题均不构成上线阻断，但需在上线后尽快迭代修复以提升系统健壮性和可维护性。

## 术语表

- **SdkDriver**: 自主循环核心驱动器，桥接纯函数状态机与真实 I/O（`src/sdk-driver.ts`）
- **SdkAgentAdapter**: Agent SDK 适配器，封装 `query()` 调用（`src/sdk-agent-adapter.ts`）
- **RunManager**: 运行生命周期管理器，负责目录创建、分支管理、worktree 编排（`src/run-manager.ts`）
- **Orchestrator**: 纯函数状态机，管理自主循环的状态转换和副作用列表（`src/orchestrator.ts`）
- **EffectExecutor**: 副作用执行器，解释 OrchestratorEffect 并执行 Git 命令、退避等 I/O（`src/effect-executor.ts`）
- **PUA_Engine**: 绩效问责质量引擎，管理压力等级、方法论路由和失败模式检测（`src/pua-engine.ts`）
- **FailureHandler**: 分层失败处理模块，含指数退避和熔断器逻辑（`src/failure-handler.ts`）
- **Frontmatter_Parser**: 统一的 YAML frontmatter 解析模块（`src/frontmatter.ts`）
- **Git_Transaction**: Git 事务管理模块，含分支名清洗和命令构建（`src/git-transaction.ts`）
- **Skill_Scheduler**: SKILL 调度器，决定下一个执行阶段（`src/skill-scheduler.ts`）
- **Router**: 路由分类模块，含档位、任务类型、项目阶段三维分类（`src/router.ts`）
- **Worktree_Manager**: Worktree 生命周期管理，含路径计算和并发限制（`src/worktree-manager.ts`）
- **Build_Dist**: 分发包构建脚本（`scripts/build-dist.sh`）
- **Hooks_Config**: Claude Code Hooks 配置文件（`hooks/hooks.json`）
- **Notes_Document**: 迭代笔记文档，记录每轮迭代的摘要和关键变更
- **Circuit_Breaker**: 熔断器，连续失败达到阈值时终止循环
- **Pressure_Level**: PUA 压力等级（L0-L4），随连续失败递增
- **TOCTOU**: Time-of-Check-Time-of-Use 竞态条件
- **Frozen_Zone**: 冻结区保护机制，阻止对 locked/approved 状态文件的写入

## 需求

### 需求 1: SDK 权限绕过运行时验证（H-1）

**用户故事:** 作为系统运维人员，我希望 SdkDriver 启动时验证上层保护机制是否就位，以便在 hooks 被误删或冻结区逻辑被绕过时及时发现风险。

#### 验收标准

1. WHEN SdkDriver 启动时, THE SdkDriver SHALL 检查 `hooks/hooks.json` 文件是否存在且包含 PreToolUse 配置节
2. IF `hooks/hooks.json` 不存在或缺少 PreToolUse 配置, THEN THE SdkDriver SHALL 输出包含 "hooks protection missing" 关键字的 `console.warn` 警告日志
3. IF `hooks/hooks.json` 不存在或缺少 PreToolUse 配置, THEN THE SdkDriver SHALL 继续正常启动而不阻断执行
4. WHEN hooks 验证检查本身抛出异常时, THE SdkDriver SHALL 捕获异常并输出警告日志后继续启动

---

### 需求 2: 并发 Worktree 创建竞态保护（H-2）

**用户故事:** 作为开发者，我希望并发创建 worktree 时不会超出 `maxConcurrentWorktrees` 上限，以便系统资源得到可靠保护。

#### 验收标准

1. WHEN RunManager 创建 worktree 时, THE RunManager SHALL 在检查并发数量和创建 worktree 之间使用文件锁（`.tinkerman/.locks/worktree.lock`）序列化操作
2. IF 文件锁在指定超时时间内无法获取, THEN THE RunManager SHALL 抛出包含超时原因的错误信息
3. WHEN worktree 创建完成或失败时, THE RunManager SHALL 释放文件锁
4. IF 文件锁机制本身失败（如目录不存在）, THEN THE RunManager SHALL 回退到无锁模式并输出警告日志

---

### 需求 3: 分发包冻结保护修复（H-3）

**用户故事:** 作为分发包用户，我希望 `.tinkerman/` 冻结区保护在分发包环境中正常工作，以便 locked/approved 状态的文件不会被意外修改。

#### 验收标准

1. THE Hooks_Config SHALL 将 PreToolUse 中的 `check-frozen.js` 调用替换为 `check-frozen.sh` 调用，或 THE Build_Dist SHALL 在构建时复制 `dist/src/` 目录到分发包
2. WHEN 分发包用户触发 PreToolUse Write/Edit hook 时, THE Hooks_Config SHALL 成功执行冻结区检查而非静默失败
3. FOR ALL 分发包构建产物, THE Build_Dist SHALL 确保冻结区检查所需的可执行文件存在于分发包中

---

### 需求 4: Worktree 删除前 Notes 保全（H-4）

**用户故事:** 作为开发者，我希望 worktree 被删除时迭代笔记不会丢失，以便我能回溯自主循环的执行历史。

#### 验收标准

1. WHEN worktree 运行结束且 `decideWorktreeCleanup` 决定删除 worktree 时, THE SdkDriver SHALL 在删除前将 notes 文件备份到主仓库的 `.tinkerman/runs/<runId>/` 目录
2. IF notes 备份失败, THEN THE SdkDriver SHALL 输出警告日志但不阻断 worktree 删除
3. THE RunManager SHALL 将 worktree 模式下的 notes 统一存储到主仓库 `.tinkerman/runs/` 目录，而非 worktree 内部

---

### 需求 5: notesContent 初始化一致性（H-5）

**用户故事:** 作为开发者，我希望 SdkDriver 初始化的 notesContent 与 RunManager 创建的 notes.md 文件内容一致，以便第一次 persistNotes 不会覆盖丢失 branchName 信息。

#### 验收标准

1. WHEN SdkDriver 构造时, THE SdkDriver SHALL 使用包含 `branchName` 的参数调用 `formatNotesDocument`
2. FOR ALL 初始化场景, THE SdkDriver 的内存 `notesContent` SHALL 与磁盘上 `notes.md` 文件内容完全一致
3. WHEN `persistNotes` 首次被调用时, THE Notes_Document SHALL 保留 `Branch:` 元数据行

---

### 需求 6: 熔断器与 PUA L4 阈值对齐（H-6）

**用户故事:** 作为系统设计者，我希望熔断器阈值与 PUA 压力等级阈值的关系被明确定义和文档化，以便两个子系统的行为可预测且一致。

#### 验收标准

1. THE Circuit_Breaker 阈值与 PUA_Engine L4 阈值 SHALL 保持逻辑一致：要么统一阈值，要么在代码注释和文档中明确说明设计意图（PUA 用于 L1-L3 预警，Circuit_Breaker 用于终止）
2. IF 选择统一阈值方案, THEN THE PUA_Engine SHALL 将 L4 触发条件调整为与 Circuit_Breaker 阈值一致
3. IF 选择文档化方案, THEN THE Orchestrator 和 PUA_Engine SHALL 在阈值常量定义处添加交叉引用注释，说明两者的协作关系

---

### 需求 7: Frontmatter 字段提取正则注入防护（M-1）

**用户故事:** 作为开发者，我希望 Frontmatter_Parser 的字段提取函数对特殊字符进行防御性处理，以便即使 fieldName 包含正则特殊字符也不会导致异常行为。

#### 验收标准

1. WHEN `extractStringField`、`extractListField` 或 `extractNumericField` 接收 fieldName 参数时, THE Frontmatter_Parser SHALL 对 fieldName 中的正则特殊字符（`.*+?^${}()|[]\`）进行转义后再构造正则表达式
2. FOR ALL 包含正则特殊字符的 fieldName 输入, THE Frontmatter_Parser SHALL 正常返回匹配结果或 null，而非抛出正则语法错误

---

### 需求 8: Effect 执行失败错误分类细化（M-2）

**用户故事:** 作为系统运维人员，我希望 effect 执行失败时能区分"预期阻断"和"意外崩溃"，以便冻结区违规不会触发不必要的指数退避。

#### 验收标准

1. WHEN effect 执行失败时, THE SdkDriver SHALL 区分 `FrozenZoneViolation`（冻结区阻断）和 `UnexpectedEffectError`（意外崩溃）两种错误类型
2. IF 错误类型为 `FrozenZoneViolation`, THEN THE SdkDriver SHALL 直接终止循环并输出明确的冻结区违规信息，不触发指数退避
3. IF 错误类型为 `UnexpectedEffectError`, THEN THE SdkDriver SHALL 按现有逻辑触发 `iteration_hard_failure` 和指数退避

---

### 需求 9: Backoff 计算边界条件防护（M-3）

**用户故事:** 作为开发者，我希望 `calculateBackoffMs` 在 `consecutiveErrors=0` 时有明确的防御行为，以便边界输入不会产生非预期的退避时间。

#### 验收标准

1. WHEN `calculateBackoffMs` 接收 `consecutiveErrors` 小于 1 的值时, THE FailureHandler SHALL 将其视为 1 进行计算（即 `Math.max(1, consecutiveErrors)`）
2. FOR ALL `consecutiveErrors` 输入值, THE FailureHandler SHALL 返回大于等于 `baseMs` 的退避时间

---

### 需求 10: PUA 状态恢复错误日志增强（M-4）

**用户故事:** 作为系统运维人员，我希望 PUA 状态恢复失败时日志包含完整错误堆栈，以便在生产环境中快速定位问题。

#### 验收标准

1. WHEN PUA 状态恢复的 catch 块捕获异常时, THE SdkDriver SHALL 在 `console.warn` 中包含 `err.stack`（如果 err 是 Error 实例）而非仅包含 `err.message`
2. FOR ALL PUA 引擎相关的 catch 块（状态恢复、成功处理、失败处理、字段写入、字段清除）, THE SdkDriver SHALL 统一使用包含堆栈信息的日志格式

---

### 需求 11: Worktree 创建失败时孤立分支清理（M-5）

**用户故事:** 作为开发者，我希望 worktree 初始化失败时已创建的 Git 分支也被清理，以便不会累积孤立的 `forge/<name>` 分支。

#### 验收标准

1. IF worktree 初始化（目录创建或 notes 写入）失败, THEN THE RunManager SHALL 在移除 worktree 后执行 `git branch -D <branchName>` 删除已创建的分支
2. IF 分支删除失败, THEN THE RunManager SHALL 在错误信息中包含分支名称以便手动清理
3. WHEN worktree 清理完成后, THE RunManager SHALL 确保不存在与本次失败创建关联的孤立 Git 分支

---

### 需求 12: Agent 调用全局超时机制（M-6）

**用户故事:** 作为系统运维人员，我希望 Agent SDK 调用有全局超时保护，以便 SDK 挂起时循环不会无限阻塞。

#### 验收标准

1. THE SdkAgentAdapter SHALL 支持可配置的全局超时参数（默认 30 分钟）
2. WHEN Agent SDK 调用超过全局超时时间时, THE SdkAgentAdapter SHALL 通过 `AbortController` 自动中断调用
3. WHEN 超时触发时, THE SdkAgentAdapter SHALL 抛出包含 "timeout" 关键字的错误，使上层触发 `iteration_hard_failure`

---

### 需求 13: resumeRun 方法连接或清理（M-7）

**用户故事:** 作为开发者，我希望 `resumeRun` 方法要么被 CLI 正确调用以支持断点续跑，要么被移除以减少死代码。

#### 验收标准

1. THE CLI SHALL 添加 `--resume <branchName>` 选项，调用 `RunManager.resumeRun()` 恢复已有运行的上下文和 notes
2. WHEN `--resume` 指定的分支不存在或无法找到对应的 run 目录时, THE CLI SHALL 输出明确的错误信息并以非零退出码退出
3. WHEN 成功恢复运行时, THE SdkDriver SHALL 从上次中断的迭代号继续执行

---

### 需求 14: Abort 信号传递至 Effect 执行（M-8）

**用户故事:** 作为开发者，我希望 Ctrl+C 信号能中断正在执行的 effect（如 git 操作），以便停止操作能及时生效。

#### 验收标准

1. WHEN `requestStop()` 被调用时, THE SdkDriver SHALL 将 abort signal 传递给 `executeEffects` 方法
2. WHEN EffectExecutor 执行 commit 或 rollback 操作时, THE EffectExecutor SHALL 在每个关键步骤前检查 abort signal 状态
3. IF abort signal 已触发, THEN THE EffectExecutor SHALL 跳过剩余 effect 并记录中断日志

---

### 需求 15: sanitizeBranchName 完整覆盖 Git 限制（M-9）

**用户故事:** 作为开发者，我希望 `sanitizeBranchName` 能过滤所有 Git 非法字符，以便生成的分支名不会被 `git checkout -b` 拒绝。

#### 验收标准

1. THE Git_Transaction SHALL 在 `ILLEGAL_BRANCH_CHARS_RE` 正则中排除 `~`、`^`、`*`、`[`、`:`、`?`、`\` 等 Git 非法字符
2. THE Git_Transaction SHALL 正确处理 `@{` 序列，确保替换后不留下孤立的 `{` 字符
3. FOR ALL 经过 `sanitizeBranchName` 处理的输出, THE Git_Transaction SHALL 生成符合 `git check-ref-format --branch` 验证的合法分支名

---

### 需求 16: buildPressurePrompt 返回值丢弃意图注释（M-10）

**用户故事:** 作为代码维护者，我希望 `handlePuaFailure` 中 `buildPressurePrompt` 返回值被丢弃的设计意图有明确注释，以便后续维护者不会误认为是 bug。

#### 验收标准

1. THE SdkDriver SHALL 在 `handlePuaFailure` 方法中 `buildPressurePrompt()` 调用处添加注释，说明返回值被有意丢弃的原因：PUA 状态通过 StatusFile 持久化，下次迭代从 StatusFile 重建 puaContext
2. THE 注释 SHALL 包含对 `executeSkillAwareIteration` 中 PUA 状态恢复逻辑的交叉引用

---

### 需求 17: 硬失败路径 PUA 状态更新（M-11）

**用户故事:** 作为系统设计者，我希望硬失败（SDK 崩溃、验证错误）也能触发 PUA 压力升级，以便 PUA 引擎能感知所有类型的失败。

#### 验收标准

1. WHEN `executeSkillAwareIteration` 的 catch 块捕获硬失败时, THE SdkDriver SHALL 调用 `handlePuaFailure` 并传入错误信息作为 summary
2. WHEN `executeGenericIteration` 的 catch 块捕获硬失败时, THE SdkDriver SHALL 调用 `handlePuaFailure`（如果 puaEnabled 为 true）
3. FOR ALL 硬失败事件, THE PUA_Engine SHALL 能够检测失败模式并相应升级 Pressure_Level

---

### 需求 18: Orchestrator 状态转换守卫（L-9）

**用户故事:** 作为系统设计者，我希望 Orchestrator 状态机在终态（aborted/stopped）时拒绝新事件，以便状态转换的正确性得到保证。

#### 验收标准

1. WHEN Orchestrator 处于 `aborted` 或 `stopped` 状态时, THE Orchestrator SHALL 拒绝 `user_interrupt`、`backoff_elapsed`、`stop_condition_met` 等事件，返回当前状态不变且 effects 为空数组
2. WHEN Orchestrator 处于 `idle` 状态时, THE Orchestrator SHALL 仅接受 `start` 事件，拒绝其他事件

---

### 需求 19: stop_condition_met 迭代计数一致性（L-10）

**用户故事:** 作为系统设计者，我希望 `stop_condition_met` 事件也增加 `currentIteration` 计数，以便迭代计数与实际执行次数一致。

#### 验收标准

1. WHEN `stop_condition_met` 事件被处理时, THE Orchestrator SHALL 将 `currentIteration` 加 1 后再转换到 `aborted` 状态

---

### 需求 20: Router 与 Skill_Scheduler 序列交叉引用（L-11）

**用户故事:** 作为代码维护者，我希望 Router 和 Skill_Scheduler 的 full 档位命令序列差异有明确的交叉引用注释，以便维护者理解两者的设计意图差异。

#### 验收标准

1. THE Router SHALL 在 `COMMAND_SEQUENCES` 定义处添加注释，说明 full 序列包含 `decide`/`spec` 是因为 Router 负责完整的交互式工作流
2. THE Skill_Scheduler SHALL 在 `SKILL_COMMAND_SEQUENCES` 定义处添加注释，说明 full 序列不含 `decide`/`spec` 是因为 Scheduler 仅处理 SKILL 执行阶段
3. THE 两处注释 SHALL 包含对对方模块的文件路径引用

---

### 需求 21: 孤儿导出函数清理（L-12）

**用户故事:** 作为代码维护者，我希望仅在测试中使用的导出函数要么连接到生产调用点，要么标注为测试专用，以便代码意图清晰。

#### 验收标准

1. FOR ALL 仅在测试中使用的导出函数（`getWorkNatureSequenceKey`、`getCommandSequence`、`shouldCommitForPhase`）, THE 对应模块 SHALL 添加 `@internal` 或 `@visibleForTesting` JSDoc 标注
2. THE 标注 SHALL 说明该函数当前仅供测试使用，未来可能连接到生产调用点

---

### 需求 22: Brownfield 提升逻辑评估（L-13）

**用户故事:** 作为系统设计者，我希望 brownfield 项目的档位提升逻辑覆盖 standard→full 场景，以便复杂的棕地项目能获得完整的工作流保护。

#### 验收标准

1. THE Router SHALL 评估并实现 brownfield 项目从 standard 到 full 的提升条件（如涉及认证变更或新服务的棕地项目）
2. IF 评估后决定不实现 standard→full 提升, THEN THE Router SHALL 在 `shouldBrownfieldBoost` 函数处添加注释说明设计决策

---

### 需求 23: confirmSpec 验证函数调用（L-14）

**用户故事:** 作为开发者，我希望 `confirmSpec` 在锁定 spec 前执行验证检查，以便不合格的 spec 不会被意外锁定。

#### 验收标准

1. WHEN `confirmSpec` 被调用时, THE Spec_Engine SHALL 先调用 `validateTestability` 验证所有需求的可测试性
2. IF spec 为 brownfield 类型, THEN THE Spec_Engine SHALL 额外调用 `validateBrownfieldDelta` 验证 Delta 节完整性
3. IF 任一验证失败, THEN THE Spec_Engine SHALL 返回包含验证错误信息的结果而非直接锁定

---

### 需求 24: Plan 执行前 Spec 状态检查（L-15）

**用户故事:** 作为开发者，我希望 plan 执行前检查 spec 是否已锁定，以便不会在未确认的 spec 基础上执行计划。

#### 验收标准

1. WHEN plan 验证逻辑执行时, THE Plan_Engine SHALL 检查关联 spec 的状态是否为 "locked"
2. IF spec 状态不为 "locked", THEN THE Plan_Engine SHALL 返回验证失败并包含 "spec not locked" 错误信息

---

### 需求 25: AtomicTask dependsOn 字段评估（L-16）

**用户故事:** 作为系统设计者，我希望 AtomicTask 类型支持表达任务间依赖关系，以便任务执行顺序能被正确约束。

#### 验收标准

1. THE Plan_Engine SHALL 在 `AtomicTask` 接口中添加可选的 `dependsOn` 字段（类型为 `number[]`，引用其他任务的 `taskNumber`）
2. WHEN `validatePlanTasks` 验证任务列表时, THE Plan_Engine SHALL 检查 `dependsOn` 引用的 taskNumber 是否存在于任务列表中
3. IF `dependsOn` 引用了不存在的 taskNumber, THEN THE Plan_Engine SHALL 返回包含无效依赖信息的验证错误
