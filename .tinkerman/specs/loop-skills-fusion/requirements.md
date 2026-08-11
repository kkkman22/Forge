---
status: retired-partial
feature: loop-skills-fusion
layout: requirements
created: 2026-04-28
tier: standard
status_note: "R6/R8/R11/R12/R13 delivered (skill-scheduler, quality-gate, execution-mode, sdk-status-helpers pure functions; loop SKILL writes autonomous mode + three-strike). R1–R5/R7 (SdkDriver runtime integration: SkillAwarePrompt construction, per-iteration SkillScheduler invocation, in-driver evaluateReviewGate + git commit/rollback) SUPERSEDED by forge-loop-native-fusion: src/sdk-driver.ts was intentionally deleted and the loop reimplemented declaratively via native ScheduleWake scheduling. The pure-function library half survives as testable units; the orchestrating SdkDriver half is obsolete by design — do not revive sdk-driver. Re-evaluate only if native scheduling proves insufficient."
---
# Requirements Document

## Introduction

Loop × Skills Fusion 是 Forge 项目中期 v2.x 路线图的核心演进方向。当前 Forge Loop（自主执行引擎）和 Forge Skills（`/forge` 交互式命令）虽然共享状态文件格式和部分类型定义，但在运行时仍是两套割裂的系统。Loop 通过 Agent SDK 启动独立会话自主迭代，但会话内部不感知 SKILL 体系；Skills 不读取执行模式来调整行为。

本需求文档定义将两者真正融合所需的剩余 30% 工作：让 Loop 的每轮迭代内部调用具体 SKILL 阶段，让 Skills 感知执行模式并跳过确认点，让质量门禁在自主模式下完整运行，并支持分发包用户通过 `/forge loop` SKILL 使用自主执行模式。

核心原则：**Loop 驱动 Skills，Skills 保障质量。自主模式不降低质量标准——所有门禁、TDD 铁律、评审流程照常执行，只是跳过人工确认点，用预设策略自动决策。**

## Glossary

- **Loop**：Forge Loop 自主执行引擎，通过 `forge-loop` CLI 或 `/forge loop` SKILL 启动的无人值守迭代循环
- **Skills**：Forge Skills 交互式命令体系，包括 forge-router、forge-plan、forge-build、forge-review、forge-test、forge-ship、forge-learn 等
- **SdkDriver**：SDK 驱动器，`src/sdk-driver.ts` 中的核心循环驱动类，桥接纯函数状态机与实际 I/O
- **SkillScheduler**：SKILL 调度器，`src/skill-scheduler.ts` 中的纯函数状态机，根据当前状态决定下一个 SKILL 阶段
- **StatusFile**：`.tinkerman/status.md`，YAML frontmatter 格式的中央状态协调文件
- **ExecutionMode**：执行模式，`"interactive"` 或 `"autonomous"`，决定 Skills 是否跳过确认点
- **ConfirmationPoint**：确认点，Skills 中需要人工确认的决策节点
- **QualityGate**：质量门禁，`src/quality-gate.ts` 中的纯函数评估器，包括 Review Gate、Test Gate、Ship Gate
- **SkillAwarePrompt**：SKILL 感知提示，包含当前阶段、档位、任务类型等上下文的迭代提示
- **CircuitBreaker**：熔断器，连续失败达到阈值时中止循环的保护机制
- **DistributionPackage**：分发包，通过 `git clone` 安装的 Forge 版本，不包含 Agent SDK 依赖
- **PlanFile**：`.tinkerman/plans/*.md`，任务拆解计划文件
- **ProgressFile**：`.tinkerman/progress/<topic>.md`，任务进度追踪文件

## Requirements

### Requirement 1: SKILL 感知提示构建

**User Story:** As a Loop 驱动器开发者, I want SdkDriver 为每轮迭代构建包含具体 SKILL 阶段指令的提示, so that Agent 在每轮迭代中执行对应的 SKILL 逻辑而非通用自主行为。

#### Acceptance Criteria

1. WHEN SdkDriver 进入 skill-aware 迭代, THE SdkDriver SHALL 调用 SkillScheduler 确定当前应执行的 SKILL 阶段
2. WHEN SkillScheduler 返回下一阶段, THE SdkDriver SHALL 构建包含该阶段名称、对应 SKILL 文件路径、执行模式标记的提示
3. WHEN 提示包含 build 阶段, THE SkillAwarePrompt SHALL 包含当前未完成任务列表（从 PlanFile 和 ProgressFile 提取）
4. WHEN 提示包含 review 阶段且存在历史修复尝试, THE SkillAwarePrompt SHALL 包含之前的 P0/P1 问题详情
5. THE SkillAwarePrompt SHALL 包含 `mode: autonomous` 指令，指示 Agent 跳过所有确认点
6. WHEN SkillScheduler 返回 `completed` 或 `aborted`, THE SdkDriver SHALL 触发循环终止流程

### Requirement 2: Skills 执行模式感知

**User Story:** As a SKILL 执行者, I want 每个 SKILL 在启动时读取 StatusFile 中的执行模式, so that 在自主模式下自动跳过确认点并采用预设策略。

#### Acceptance Criteria

1. WHEN 一个 SKILL 启动执行, THE SKILL SHALL 从 StatusFile 读取 `mode` 字段值
2. WHILE `mode` 为 `"autonomous"`, THE SKILL SHALL 在所有确认点采用 `resolveConfirmation()` 返回的预设策略
3. WHILE `mode` 为 `"interactive"` 或缺失, THE SKILL SHALL 在确认点等待用户输入
4. WHEN Router 确认点在自主模式下触发, THE Router_SKILL SHALL 直接采用 AI 建议的档位（预设策略 `auto-detect`）
5. WHEN Plan 确认点在自主模式下触发, THE Plan_SKILL SHALL 自动批准生成的计划（预设策略 `auto-approve`）
6. WHEN Build 暂停确认点在自主模式下触发, THE Build_SKILL SHALL 不暂停，连续执行（预设策略 `continue`）
7. WHEN Review P0/P1 处理确认点在自主模式下触发, THE Review_SKILL SHALL 自动进入修复循环（预设策略 `auto-fix`）
8. WHEN Ship 交付方式确认点在自主模式下触发, THE Ship_SKILL SHALL 默认保留分支（预设策略 `keep branch`）

### Requirement 3: 状态感知迭代调度

**User Story:** As a Loop 驱动器, I want 每轮迭代开始前读取 StatusFile 和 PlanFile 的实际状态, so that 调度决策基于真实的项目状态而非仅依赖纯函数调度器的推断。

#### Acceptance Criteria

1. WHEN 新一轮迭代开始, THE SdkDriver SHALL 从 StatusFile 读取 `phase`、`tier`、`mode`、`loop_iteration` 字段
2. WHEN PlanFile 存在, THE SdkDriver SHALL 从 PlanFile 提取 `status` 字段（draft/approved/locked）
3. WHEN ProgressFile 存在, THE SdkDriver SHALL 从 ProgressFile 提取已完成和未完成任务数量
4. THE SdkDriver SHALL 将提取的状态字段传入 SkillScheduler 的 `determineNextSkill()` 函数
5. WHEN StatusFile 中 `phase` 字段与 SkillScheduler 推断不一致, THE SdkDriver SHALL 以 StatusFile 中的实际 `phase` 为准
6. WHEN 迭代完成后, THE SdkDriver SHALL 更新 StatusFile 的 `phase` 和 `loop_iteration` 字段

### Requirement 4: 质量门禁集成

**User Story:** As a Loop 驱动器, I want 在 review 和 test 阶段完成后调用质量门禁评估函数, so that 迭代成功/失败判定基于 Skills 的质量标准。

#### Acceptance Criteria

1. WHEN Agent 报告 review 阶段完成, THE SdkDriver SHALL 调用 `evaluateReviewGate()` 评估 review 报告
2. WHEN `evaluateReviewGate()` 返回 `blocked`, THE SdkDriver SHALL 将 `gate_result` 设为 `"blocked"` 并递增 `reviewFixAttempts`
3. WHEN `evaluateReviewGate()` 返回 `passed`, THE SdkDriver SHALL 将 `gate_result` 设为 `"passed"` 并重置 `reviewFixAttempts` 为 0
4. WHEN Agent 报告 test 阶段完成, THE SdkDriver SHALL 调用 `evaluateTestGate()` 评估测试结果
5. WHEN `evaluateTestGate()` 返回 `blocked`, THE SdkDriver SHALL 将迭代标记为 soft failure
6. WHEN ship 阶段触发, THE SdkDriver SHALL 调用 `evaluateShipGate()` 执行三重门禁检查（Review + Test + Progress）
7. IF `evaluateShipGate()` 返回 `blocked`, THEN THE SdkDriver SHALL 中止 ship 并将迭代标记为 soft failure

### Requirement 5: 修复循环与熔断保护

**User Story:** As a Loop 驱动器, I want 在 review 门禁返回 blocked 时自动进入修复循环，并在超过最大重试次数时触发熔断, so that P0/P1 问题得到自动修复且不会陷入无限循环。

#### Acceptance Criteria

1. WHEN `evaluateReviewGate()` 返回 `blocked`, THE SdkDriver SHALL 将 SkillScheduler 的 `currentPhase` 回退到 `build`
2. WHEN 进入修复循环, THE SdkDriver SHALL 在下一轮迭代的提示中注入 P0/P1 问题详情（从 GateResult.issues 提取）
3. WHEN 修复完成后重新进入 review, THE SdkDriver SHALL 再次调用 `evaluateReviewGate()` 评估修复结果
4. THE SdkDriver SHALL 维护 `reviewFixAttempts` 计数器，每次 review 返回 `blocked` 时递增
5. WHEN `reviewFixAttempts` 达到 `maxReviewFixAttempts`（默认 3）, THE SkillScheduler SHALL 返回 `aborted` 阶段
6. WHEN SkillScheduler 返回 `aborted`, THE SdkDriver SHALL 输出未解决的 P0/P1 问题列表并终止循环
7. WHEN review 返回 `passed`, THE SdkDriver SHALL 重置 `reviewFixAttempts` 为 0

### Requirement 6: StatusFile 生命周期管理

**User Story:** As a Loop 驱动器, I want 在 Loop 启动时写入、运行中更新、结束时清除 StatusFile 的 Loop 相关字段, so that Skills 和外部工具能准确感知 Loop 的运行状态。

#### Acceptance Criteria

1. WHEN Loop 启动, THE SdkDriver SHALL 写入 `mode: "autonomous"`、`loop_run_id`、`loop_iteration: 0`、`skill_sequence` 字段到 StatusFile
2. WHEN 每轮迭代完成, THE SdkDriver SHALL 更新 `loop_iteration` 和 `phase` 字段
3. WHEN Loop 正常完成（SkillScheduler 返回 `completed`）, THE SdkDriver SHALL 清除 `mode`、`loop_run_id`、`loop_iteration`、`skill_sequence` 字段
4. WHEN Loop 异常退出（熔断或错误）, THE SdkDriver SHALL 清除 `mode`、`loop_run_id`、`loop_iteration` 字段但保留 `phase` 字段
5. IF StatusFile 中残留上次 Loop 的 `loop_run_id`, THEN THE SdkDriver SHALL 清理残留字段并从当前 `phase` 继续执行
6. THE SdkDriver SHALL 使用 `writeLoopFields()` 和 `clearLoopFields()` 纯函数操作 StatusFile 内容

### Requirement 7: Git 事务与 Commit 策略

**User Story:** As a Loop 驱动器, I want 根据 SKILL 阶段和执行结果决定 Git commit 或 rollback 操作, so that 只有产生代码变更的成功阶段被提交，失败阶段被回滚。

#### Acceptance Criteria

1. WHEN build 阶段成功完成, THE SdkDriver SHALL 执行 Git commit（使用 Plan 中定义的 commit message）
2. WHEN plan 阶段成功完成（status = approved）, THE SdkDriver SHALL 执行 Git commit（message: `forge(plan): <topic> plan approved`）
3. WHEN fix 阶段成功完成, THE SdkDriver SHALL 执行 Git commit（message: `forge(fix): resolve P0/P1 from review`）
4. WHEN review 或 test 阶段完成, THE SdkDriver SHALL 不执行 Git commit（仅产生报告）
5. WHEN build 或 fix 阶段失败, THE SdkDriver SHALL 执行 Git rollback 到上一个成功 commit
6. THE SdkDriver SHALL 使用 `shouldCommitForPhase()` 纯函数判断是否需要 commit
7. IF Git commit 操作失败, THEN THE SdkDriver SHALL 将迭代标记为 hard failure 并触发退避机制

### Requirement 8: 分发包 Loop SKILL 支持

**User Story:** As a 分发包用户, I want 通过 `/forge loop "目标"` 命令在无 Agent SDK 环境下使用自主执行模式, so that 不依赖 npm 包也能享受自主执行能力。

#### Acceptance Criteria

1. THE Loop_SKILL SHALL 在单次 Agent 会话中实现完整的迭代控制逻辑（状态机驱动）
2. WHEN `/forge loop` 被调用, THE Loop_SKILL SHALL 写入 StatusFile 的 Loop 相关字段（与 SDK 环境格式相同）
3. THE Loop_SKILL SHALL 通过读写 StatusFile 维护迭代状态，而非依赖外部进程管理
4. THE Loop_SKILL SHALL 复用与 SDK 环境相同的质量门禁逻辑（review P0/P1、test 通过率、ship 三重检查）
5. THE Loop_SKILL SHALL 实现熔断保护：读取 StatusFile 中的 `reviewFixAttempts` 计数，超限时中止
6. WHEN Loop_SKILL 完成执行, THE Loop_SKILL SHALL 清除 StatusFile 中的 Loop 相关字段
7. THE Loop_SKILL SHALL 直接执行 Git 命令实现 commit/rollback（替代 SDK 环境的 EffectExecutor）

### Requirement 9: 迭代结果报告

**User Story:** As a Loop 用户, I want 在 Loop 完成或中止时看到结构化的执行摘要, so that 能快速了解执行结果和需要的后续操作。

#### Acceptance Criteria

1. WHEN Loop 正常完成, THE SdkDriver SHALL 输出包含目标、档位、总迭代数、各阶段结果的完成摘要
2. WHEN Loop 因熔断中止, THE SdkDriver SHALL 输出未解决的 P0/P1 问题列表和恢复建议
3. WHEN Loop 因错误中止, THE SdkDriver SHALL 输出错误原因和恢复建议（如 `/forge resume`）
4. THE 完成摘要 SHALL 包含每个已执行 SKILL 阶段的通过/失败状态
5. WHEN ship 阶段以 `keep branch` 策略完成, THE 完成摘要 SHALL 包含分支名称和后续操作提示

### Requirement 10: 前置检查与边界处理

**User Story:** As a Loop 启动器, I want 在启动前执行前置检查并优雅处理边界情况, so that 避免在无效状态下启动循环。

#### Acceptance Criteria

1. WHEN `.tinkerman/` 目录不存在, THE Loop SHALL 输出提示信息并拒绝启动
2. WHEN StatusFile 中已有进行中的任务（`phase` 非 completed/aborted）, THE Loop SHALL 提示用户确认是否覆盖
3. WHEN 目标描述为空, THE Loop SHALL 输出用法说明并拒绝启动
4. WHEN `--tier` 选项值无效, THE Loop SHALL 输出有效值列表并拒绝启动
5. IF StatusFile 中残留上次异常退出的 `mode: autonomous` 和 `loop_run_id`, THEN THE Loop SHALL 清理残留状态并从当前 `phase` 继续执行
6. WHEN hooks/hooks.json 不存在或缺少 PreToolUse 配置, THE Loop SHALL 输出警告但不阻断启动

### Requirement 11: Skill 阶段 Commit 策略纯函数

**User Story:** As a 开发者, I want 通过纯函数判断每个 SKILL 阶段完成后是否需要 Git commit, so that commit 决策逻辑可独立测试且无副作用。

#### Acceptance Criteria

1. THE `shouldCommitForPhase()` 函数 SHALL 对 `build`、`plan`、`fix`、`refactor-apply`、`fix-apply` 阶段在 success=true 时返回 true
2. THE `shouldCommitForPhase()` 函数 SHALL 对 `review`、`test`、`ship`、`router`、`learn`、`refactor-scan`、`fix-analyze` 阶段返回 false
3. THE `shouldCommitForPhase()` 函数 SHALL 对任何阶段在 success=false 时返回 false
4. FOR ALL 有效的 SkillPhase 值, `shouldCommitForPhase(phase, true)` 然后 `shouldCommitForPhase(phase, false)` SHALL 对 false 情况始终返回 false（幂等性）
5. THE `shouldCommitForPhase()` 函数 SHALL 对未知阶段名称返回 false（安全默认值）

### Requirement 12: SkillScheduler 状态机完整性

**User Story:** As a 开发者, I want SkillScheduler 的状态转换覆盖所有可能的阶段组合, so that 不会出现未处理的状态导致循环卡死。

#### Acceptance Criteria

1. FOR ALL 有效的 SkillPhase 输入, THE `determineNextSkill()` 函数 SHALL 返回一个有效的 SchedulerResult（不抛出异常）
2. WHEN `currentPhase` 为未知值, THE SkillScheduler SHALL 回退到 `router` 阶段
3. WHEN `reviewFixAttempts` 达到 `maxReviewFixAttempts` 且 `reviewResult` 为 `"fail"`, THE SkillScheduler SHALL 返回 `aborted`
4. THE SkillScheduler SHALL 对终态（`completed`、`aborted`）返回自身（幂等性）
5. FOR ALL 非终态的 SkillPhase, THE SkillScheduler SHALL 最终收敛到 `completed` 或 `aborted`（无无限循环）
6. THE `getCommandSequence()` 函数 SHALL 对未知 tier 返回 standard 序列（安全默认值）

### Requirement 13: 执行模式解析与写入的往返一致性

**User Story:** As a 开发者, I want StatusFile 的执行模式字段在写入后读取能得到相同值, so that 状态不会在序列化/反序列化过程中丢失。

#### Acceptance Criteria

1. FOR ALL 有效的 ExecutionMode 值, `getExecutionMode(writeExecutionMode(content, mode))` SHALL 返回该 mode 值（往返一致性）
2. FOR ALL 有效的 LoopStatusFields, `extractLoopFields(writeLoopFields(content, fields))` SHALL 返回等价的 fields 值（往返一致性）
3. WHEN `clearLoopFields()` 被调用后, `extractLoopFields()` SHALL 返回所有字段为 undefined 的对象
4. WHEN `clearExecutionMode()` 被调用后, `getExecutionMode()` SHALL 返回 `"interactive"`（默认值）
5. THE `writeLoopFields()` 函数 SHALL 保留 StatusFile 中非 Loop 相关的字段不变
