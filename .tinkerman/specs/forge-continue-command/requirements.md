---
status: draft
feature: forge-continue-command
layout: requirements
created: 2026-06-19
updated: 2026-06-19
tier: standard
work_nature: feature
---
# Requirements Document — /forge continue 交互式阶段推进命令

## Introduction

Forge 的工作流(如标准路径 `plan → build → review → test → ship`)目前需要用户记住并依次敲击每个子命令。AGENTS.md §2.7 "No Confirmation Between Steps" 铁律要求阶段间不停顿,但该铁律的实现**完全依赖每个 sub-skill 的 markdown 自觉触发下一个 `Skill(skill="forge", args="<next>")`,没有程序化强制**。

当 skill 未能自动推进、或会话在阶段间中断时,**唯一的恢复机制是用户知道下一个子命令**。这与铁律 §2.7 的"不停顿"理念方向一致但实现割裂——用"铁律禁止停顿"推 AI,却没有给用户一个"不记工作流也能推进"的入口。

代码调研发现**底层基础设施已全部存在,只是分叉在两个消费者**:
- `src/loop/phase-transitions.ts:124` `getNextPhase` + `src/loop/package-runtime.ts:59` `advanceLoopAfterPhaseSuccess`——**运行时已验证**的表驱动阶段推进,但只被 `/forge loop`(自主后台模式)调用。
- `src/loop/package-runtime.ts:159` `buildNextForgeArgs`——已能生成 `Skill(skill="forge", args="<phase>")` 参数字符串(含 `--package` 装饰),**是 continue 命令的现成模板**。
- `src/skill-scheduler.ts:116` `determineNextSkill`——更丰富的 13 状态机(含 debug/refactor/fix 分支),**有 property test 但零生产调用方**(死代码)。
- `src/status-manager.ts:54` `readTaskStatus`——已能从 `.tinkerman/status.md` 提取 `phase`/`tier`/`current_package`/`review_result`。

本 spec 新增 `/forge continue` 命令,**把 loop 路径已有的推进逻辑接到交互式路径**,让用户只需反复敲 `continue` 即可推进工作流,无需记忆命令序列。这与 Trellis 的 `continue` 命令理念一致。

## Goals

- 提供单一入口 `/forge continue`,读取 `.tinkerman/status.md` 当前 phase/tier,自动推进到下一个合法 phase。
- 复用 `getNextPhase` / `buildNextForgeArgs` 已验证的转换逻辑,不新建推进引擎。
- 把 §2.7 铁律的"review/test 无结果不得推进"从"靠 skill 自觉"升级为"continue 命令程序化强制"(`getNextPhase` 在无 reviewResult 时会抛异常,`phase-transitions.ts:131`)。
- 顺带处理 `determineNextSkill` 死代码:要么 continue 统一用它,要么明确删除。

## Non-Goals

- **不新建**阶段推进引擎——`getNextPhase` 已是 SSOT(`src/workflow-graph.ts:106` 的 DEFAULT_WORKFLOW_GRAPH)。
- 不取代 `/forge loop`——loop 是无人值守后台自主模式,continue 是交互式逐步推进。二者并存。
- 不改变三维路由(Light/Standard/Full)的判定逻辑——continue 只在路由已确定后推进。
- 不在本 spec 实现"跨任务 continue"——continue 是 within-task 推进(对齐 Trellis 语义),跨任务恢复由 `/forge resume` 负责。
- 不让 continue 绕过门禁:Spec/Plan/Branch gate 仍由各子命令自己检查,continue 只负责"定位下一步 + 分发"。

## Requirements

### Requirement 1: /forge continue 命令注册与分发

**User Story:** As a developer, I want to type `/forge continue` to advance the current task to its next workflow phase, so that I don't have to memorize the phase sequence。

#### Acceptance Criteria

1. THE `skills/forge/lib/continue/instructions.md` SHALL 被创建,作为 continue 子 skill 的指令文档(dispatch_mode 建议 inline,因为它是轻量 glue)。
2. THE `skills/forge/registry.toml` SHALL 新增 `[continue]` 块(仿照 `:205` 的 `[resume]` 块结构)。
3. THE `src/forge-dispatcher/allowlist.ts`(`:5-43` 的 ALLOW_LIST)SHALL 新增 `continue` 项,使 37 → 38(或保持计数策略,见 Requirement 4)。
4. THE `.agents/skills/source-command-forge/SKILL.md:16-36` 和 `.claude/commands/forge.md` 的子命令分发表 SHALL 新增 `continue` 精确匹配分支。
5. THE SSOT 生成链(`scripts/sync-command-registry.mjs`)SHALL 在运行后正确反映新命令计数。

### Requirement 2: continue 读取状态并推进

**User Story:** As a developer, I want continue to read my current phase and route me to the next one using the same logic as the autonomous loop。

#### Acceptance Criteria

1. THE continue skill SHALL 调用 `readTaskStatus`(`src/status-manager.ts:54`)读取 `.tinkerman/status.md` 的 `phase`、`tier`、`work_nature`、`current_package`、`review_result`、`testPassed` 字段。
2. THE continue skill SHALL 调用 `getNextPhase`(`src/loop/phase-transitions.ts:124`)计算下一阶段,参数来自 status.md 字段。
3. THE continue skill SHALL 调用 `buildNextForgeArgs`(`src/loop/package-runtime.ts:159`)生成下一个 `Skill(skill="forge", args="<phase>")` 调用参数(含 `--package` 装饰当存在 current_package)。
4. THE continue skill SHALL 在 status.md 不存在或无 active task 时,输出友好提示并引导用户 `/forge <描述>` 或 `/forge resume`,不报错。
5. THE continue skill SHALL 在已处于 `completed`/`shipped` 终态时,输出"任务已完成"提示,不重复推进。

### Requirement 3: continue 强制门控语义(核心增量价值)

**User Story:** As a developer, I want continue to refuse advancing past review/test when no passing result is recorded, so that the §2.7 iron law is enforced programmatically rather than靠 skill 自觉。

#### Acceptance Criteria

1. THE continue skill SHALL 在当前 phase 为 `review` 且 status.md 无 `review_result`/结果非 pass 时,**拒绝推进**,输出"请先运行 `/forge review`"。
2. THE continue skill SHALL 在当前 phase 为 `test` 且 status.md 无 `testPassed`/结果非 pass 时,**拒绝推进**,输出"请先运行 `/forge test`"。
3. THE 门控行为 SHALL 对齐 `getNextPhase` 在 `phase-transitions.ts:131-136` 的抛异常语义,但 continue 把异常转化为用户可读的引导提示(不中断会话)。
4. THE continue skill SHALL 在 review/test 失败(P1/P0 阻断)时,路由回 `build`(对齐 `workflow-graph.ts` 的 `review→build` recovery loop,`allowRecoveryLoop: true`)而非前进。

### Requirement 4: determineNextSkill 死代码处置

**User Story:** As a maintainer, I want the duplicated phase-advance logic resolved, so that there's a single source of truth for "what's next"。

#### Acceptance Criteria

1. THE 实现 SHALL 做出明确二选一决策并记录在 design.md:
   - **方案 A(推荐)**:continue 复用 `getNextPhase`(已运行时验证),保留 `determineNextSkill` 仅为 property test 的测试夹具,在 `skill-scheduler.ts` 加注释说明"非生产路径,仅为不变量测试服务"。
   - **方案 B**:continue 改用 `determineNextSkill`(13 状态机更丰富,含 debug/refactor 分支),并把它接入生产,同时评估能否替代 `getNextPhase`。
2. THE 无论选 A 还是 B,SHALL 消除"两套并行推进实现、一套零调用"的认知负担,在 design.md 记录理由。
3. THE 不得删除 `determineNextSkill` 的 property test(`test/skill-scheduler.property.test.ts`)——它守护转换不变量,即使函数本身不进生产路径也有价值。

### Requirement 5: 文档与铁律同步

**User Story:** As a user, I want the docs to tell me I can use continue instead of memorizing the sequence。

#### Acceptance Criteria

1. THE `docs/reference-commands.md` SHALL 新增 `/forge continue` 条目,说明"读取当前 phase 自动推进"。
2. THE `AGENTS.md` §2.7 "No Confirmation Between Steps" 的实现说明 SHALL 补充:continue 命令是阶段推进的程序化入口,与铁律同向。
3. THE `README.md` 的命令概览表 SHALL 评估是否新增 continue 条目(若命令计数策略要求保持 ≤N,则在 design.md 决策)。

## 验收标准

- [ ] `/forge continue` 在 status.md 有 active task 时正确推进到下一 phase
- [ ] `/forge continue` 在 review 未通过时拒绝推进并引导 `/forge review`
- [ ] `/forge continue` 在无 active task 时输出友好提示不报错
- [ ] `getNextPhase` 或 `determineNextSkill` 的死代码状态在 design.md 明确记录
- [ ] allowlist / registry.toml / 分发表三处 SSOT 同步(sync-command-registry.mjs 验证)
- [ ] 现有 `/forge loop` 行为不受影响(回归测试)

## 依赖

- 无前置 spec 依赖。`getNextPhase` / `buildNextForgeArgs` / `readTaskStatus` 均已存在。
- 与 `metrics-hook-wiring` spec 有弱关联:continue 的使用率可由 metrics 采集,但不阻塞实现。

## 非目标

- 不实现"continue 自动触发 learn/ship 等 Full tier 专属阶段"——continue 只在当前 tier 的命令序列内推进。
- 不实现 continue 的 `--dry-run`(显示下一步但不执行)——可作为未来增强,本 spec 不含。
- 不修改 `getNextPhase` 的 TRANSITION_TABLE——continue 是消费者,不是转换表的编辑者。
