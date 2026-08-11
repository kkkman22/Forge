---
status: completed
feature: forge-loop-native-fusion
layout: requirements
created: 2026-06-01
tier: standard
---
# Forge Loop 原生融合 — 需求文档

## 引言

Forge Loop 当前作为独立子系统存在：`forge-loop-cli.ts`（44KB）、SDK driver、子进程管理器、Desktop App（Tauri）、npm 包。这套架构带来以下问题：

1. **维护面过大**：~2000+ 行核心代码 + Desktop App + npm 包，调度逻辑与 Claude Code 原生 `/loop` + `ScheduleWakeup` 重复
2. **分发割裂**：Forge 插件通过 Claude Code 市场分发，但 forge-loop 需要用户单独 `npx forge-loop` 或下载 Desktop App
3. **未经实战验证**：无真实场景使用记录，战略定位（"护城河"）缺乏数据支撑

Claude Code v2.1+ 已内置完整的调度能力：

| 工具 | 能力 |
|------|------|
| `ScheduleWakeup` | 动态自调速（60s–3600s），`--resume` 恢复，自适应 pacing |
| `CronCreate` | 固定间隔 cron 调度，7 天过期，50 并发上限 |
| `/loop` skill | 用户态入口，动态/固定两种模式，`loop.md` 可定制 |
| `Monitor` | 后台脚本执行 + 流式输出，避免轮询 |

本 spec 将 forge-loop 的差异化价值（质量门禁、Git 事务、Three-strike、阶段流转）剥离为轻量 skill 逻辑，调度骨架完全委托给原生工具。**用户入口从 `npx forge-loop` 变为 `/forge loop`，随 Forge 插件一起分发，零额外安装。**

### 核心原则

> **Scheduling is the platform's job. Forge's job is decision logic.**
> 调度交给 Claude Code 原生工具，Forge 只做"下一步该做什么"的决策。

### 与现有机制的关系

| 分类 | 机制 | 决策 |
|------|------|------|
| **删除**（原生上位替代） | `forge-loop-cli.ts`、`sdk-driver`、`CliSubprocessDriver`、`persistent-loop.sh`、Desktop App、npm 包 | 全部移除 |
| **保留**（Forge 独有价值） | Three-strike 检测、阶段流转状态机、Git 事务（commit/rollback）、质量门禁、stopWhen 条件、loop state JSON schema | 重构为 skill 逻辑 |
| **保留**（工作流基础设施） | Forge dispatcher（ADR-0004）、`.tinkerman/` 文件系统状态、TDD 铁律、分支保护、review 三层评审 | 不变 |

## 术语

| 术语 | 定义 |
|------|------|
| **ScheduleWakeup** | Claude Code 内置工具，动态自调度的 `/loop` 驱动器，delaySeconds 硬限 [60, 3600] |
| **CronCreate** | Claude Code 内置 cron 调度工具，session-scoped，`--resume` 可恢复 |
| **loop state** | `.tinkerman/progress/loop-{id}.json`，记录 loop 实例的阶段、计数器、目标等状态 |
| **Native Loop Skill** | Claude Code 内置 `/loop` skill，非 Forge 实现 |
| **Forge Loop Skill** | 本 spec 产出的 `skills/forge/lib/loop/instructions.md`，Forge 的 loop 子命令 |
| **阶段流转** | loop 实例中 decide → spec → plan → build → review → test → ship → learn 的自动推进 |
| **Three-strike** | 连续 3 次同一方向失败后暂停，要求人工干预的铁律 |
| **Git 事务** | 阶段完成时原子提交，Three-strike 触发时回滚到最后一个成功提交点 |
| **stopWhen** | 用户声明的终止条件，如"所有 lint 检查通过"，loop 在条件满足时自动结束 |

## 需求

### Requirement 1: Loop Skill 入口与初始化

**User Story:** 作为 Forge 用户，我希望在 Claude Code 会话内输入 `/forge loop "做X"` 就能启动自动化工作流，不需要安装任何额外工具。

#### 验收标准

1. WHEN 用户输入 `/forge loop "<goal>"` THEN 系统 SHALL 创建 `.tinkerman/progress/loop-{id}.json` 状态文件，含字段 `{id, goal, phase, consecutiveFailures, totalIterations, createdAt, stopWhen}`
2. WHEN 状态文件创建完成 THEN 系统 SHALL 立即执行 Forge 工作流的第一个阶段（由 tier 路由决定：Light → build；Standard → plan；Full → decide）
3. WHEN 第一个阶段启动时 THEN 系统 SHALL 调用 `ScheduleWakeup` 设置 fallback 唤醒（delaySeconds: 120，reason: "loop phase fallback"），确保即使阶段执行中断也有恢复机会
4. WHEN 用户输入 `/forge loop continue <id>` THEN 系统 SHALL 读取对应 loop state 文件，从当前阶段继续执行。此格式同时是 ScheduleWakeup/CronCreate 的 prompt 参数值，确保 dispatcher 正确路由（第一个 token `loop` 匹配 allowlist，`continue <id>` 作为 args 传递）
5. THE loop skill SHALL 在 `allowed_tools` frontmatter 中声明 `Read, Agent, Bash, Skill, Glob, Grep, CronCreate, CronList, CronDelete, ScheduleWakeup`
6. THE loop skill 的 `dispatch_mode` SHALL 为 `fork`（需要独立上下文执行长时间任务）

### Requirement 2: 阶段流转状态机

**User Story:** 作为 Forge 用户，我希望 loop 能自动推进 plan → build → review → test → ship 全流程，无需人工干预每个阶段转换。

#### 验收标准

1. THE loop state JSON SHALL 包含 `phase` 字段，取值范围为 `{init, decide, spec, plan, build, review, test, ship, learn, complete, halted}`
2. WHEN 当前阶段成功完成 THEN 系统 SHALL 根据以下流转表推进到下一阶段：

   | 当前阶段完成 | Tier | 下一阶段 |
   |-------------|------|---------|
   | decide | Full | spec |
   | spec | Full | plan |
   | plan | Standard/Full | build |
   | build | any | review |
   | review (通过) | any | test |
   | review (P0/P1) | any | build（修复） |
   | test | any | ship |
   | ship | any | learn |
   | learn | any | complete |

3. WHEN 阶段流转完成 THEN 系统 SHALL 更新 loop state JSON 的 `phase` 字段，并通过 `ScheduleWakeup` 调度下一次迭代（delaySeconds: 60，reason: "phase transition: {from} → {to}"）
4. WHEN review 阶段发现 P0/P1 THEN 系统 SHALL 将 phase 设回 `build`，并在 loop state 中记录 `lastReviewResult: {p0: N, p1: N}`，后续 build 阶段可见
5. WHEN phase 到达 `complete` THEN 系统 SHALL 输出执行总结（含总迭代数、总 token 消耗估算、各阶段耗时），且 **不再** 调用 ScheduleWakeup（loop 自然终止）
6. WHEN phase 为 `halted` THEN 系统 SHALL 输出暂停原因（Three-strike / 用户中止 / 不可恢复错误），且不再调用 ScheduleWakeup

### Requirement 3: Three-strike 检测与 Git 事务

**User Story:** 作为 Forge 用户，我希望 loop 在连续失败时自动暂停并回滚，不会陷入无限重试的死循环。

#### 验收标准

1. THE loop state JSON SHALL 包含 `consecutiveFailures: number` 字段
2. WHEN 一个阶段执行失败（exit code ≠ 0、超时、或子 skill 返回错误）THEN 系统 SHALL 递增 `consecutiveFailures`
3. WHEN `consecutiveFailures >= 3` THEN 系统 SHALL 执行以下动作：
   - 将 phase 设为 `halted`
   - 将 `haltReason` 设为 `"three-strike: {phase} failed {N} times consecutively"`
   - 执行 Git 回滚：`git reset --hard {lastSuccessCommit}`（`lastSuccessCommit` 在每次成功阶段完成时记录）
   - 输出诊断信息（最近 3 次失败的摘要、建议的人工干预方向）
   - **不**调用 ScheduleWakeup
4. WHEN 一个阶段执行成功 THEN 系统 SHALL：
   - 将 `consecutiveFailures` 重置为 0
   - 执行原子 Git 提交（commit message: `feat(loop): {phase} complete — {goal摘要前50字符}`）
   - 将当前 commit hash 记录到 `lastSuccessCommit`
5. WHEN `lastSuccessCommit` 未设置（首次失败）THEN Git 回滚 SHALL 退化为 `git stash`（不丢失工作区修改但不创建提交）

### Requirement 4: 动态调度策略

**User Story:** 作为 Forge 用户，我希望 loop 在构建活跃时快速迭代（~60s），在等待 review 时放慢节奏（~300s），而不是固定间隔盲目轮询。

#### 验收标准

1. THE loop skill SHALL 根据阶段和失败次数动态选择 `ScheduleWakeup` 的 `delaySeconds`：

   | 场景 | delaySeconds | reason |
   |------|-------------|--------|
   | 阶段成功 → 下一阶段 | 60 | "phase transition: {from} → {to}" |
   | 阶段失败（第 1 次） | 120 | "retry after 1st failure: {phase}" |
   | 阶段失败（第 2 次） | 300 | "retry after 2nd failure: {phase}" |
   | review P0/P1 → 回到 build | 60 | "P0/P1 fix cycle" |
   | ship 成功 → learn | 120 | "learning phase" |

2. WHEN delaySeconds 需要超过 3600（ScheduleWakeup 上限）THEN 系统 SHALL 使用 `CronCreate` 替代（cron 表达式计算目标时间）
3. THE `ScheduleWakeup` 的 `prompt` 参数 SHALL 为 `/forge loop continue {id}`，确保每次唤醒重新进入 Forge skill 上下文（规避 GitHub #61492 skill context 丢失问题）。格式为空格分隔：dispatcher 精确匹配第一个 token `loop` 到 allowlist，`continue {id}` 作为 args 传递给 loop skill
4. WHEN 调度完成 THEN 系统 SHALL 在 loop state 中记录 `{lastScheduledAt, nextScheduledReason}`，供诊断和 resume 使用

### Requirement 5: 跨会话恢复

**User Story:** 作为 Forge 用户，我希望即使关闭终端后重新打开，loop 还能从中断的地方继续，不会丢失进度。

#### 验收标准

1. WHEN 用户执行 `claude --resume` THEN `CronCreate` 的未过期任务 SHALL 由 Claude Code 自动恢复（原生行为，无需 Forge 额外实现）
2. WHEN CronCreate 任务触发 `/forge loop continue {id}` 但 loop state 文件不存在 THEN 系统 SHALL 输出警告 "loop {id} state file missing, cannot continue" 并删除该 cron 任务
3. WHEN 用户输入 `/forge loop status` THEN 系统 SHALL 列出所有活跃的 loop 实例（从 `.tinkerman/progress/loop-*.json` 读取），显示每个实例的 id、goal、当前 phase、失败次数、下次调度时间
4. WHEN 用户输入 `/forge loop abort <id>` THEN 系统 SHALL 将 phase 设为 `halted`、调用 `CronDelete` 删除关联 cron 任务、输出中止确认
5. THE loop state JSON SHALL 包含足够的恢复信息（`phase`, `lastSuccessCommit`, `consecutiveFailures`, `goal`），使得任何新的 Claude Code 会话都能通过 `/forge loop continue {id}` 无歧义地恢复

### Requirement 6: stopWhen 条件终止

**User Story:** 作为 Forge 用户，我希望设定明确的终止条件（如"所有测试通过"），loop 在条件满足时自动结束。

#### 验收标准

1. WHEN 用户通过 `/forge loop "做X" --stop-when "所有 lint 检查通过"` 传入 stopWhen 条件 THEN 系统 SHALL 将条件字符串存入 loop state 的 `stopWhen` 字段
2. WHEN 每个阶段成功完成后 THEN 系统 SHALL 评估 stopWhen 条件（通过 Bash 执行对应的检查命令，或让 Claude 基于当前代码状态判断）
3. WHEN stopWhen 条件评估为 `true` THEN 系统 SHALL：
   - 将 phase 设为 `complete`
   - 设置 `completionReason: "stopWhen satisfied: {条件}"`
   - 跳过后续阶段
   - 输出总结
   - **不**调用 ScheduleWakeup
4. WHEN stopWhen 条件评估为 `false` 或 `uncertain` THEN 系统 SHALL 按正常阶段流转继续

### Requirement 7: 旧系统退役与向后兼容

**User Story:** 作为 Forge 维护者，我希望干净地移除旧 forge-loop 的代码和产物，不留下死代码或误导性的文档。

#### 验收标准

1. THE 以下文件/模块 SHALL 从仓库中删除：
   - `src/forge-loop-cli.ts`
   - `src/loop-types.ts`
   - `src/loop-error-controller.ts`
   - `src/verify-loop.ts`
   - `src/retry-loop.ts`
   - `src/loop-index.ts`
   - `scripts/persistent-loop.sh`
   - Desktop App 相关目录（`desktop/` 或等效路径）
   - `package.json` 中 `forge-loop` 相关的 bin/exports 条目
2. THE 以下测试文件 SHALL 删除或重写（对应的测试逻辑迁移到新 skill 的契约测试）：
   - `test/forge-loop-cli.test.ts`
   - `test/verify-loop.test.ts`
   - `test/loop-integration.test.ts`
   - `test/loop-skill-integration.test.ts`
   - `test/loop-orchestrator.property.test.ts`
   - `test/retry-loop.test.ts`
3. THE `skills/forge/lib/loop/instructions.md` SHALL 完全重写（替换旧指令为新融合方案）
4. THE ADR-0007 中关于 "loop 永久使用 Subagent" 的决策 SHALL 保持不变（融合后 loop 仍通过 dispatcher 的 fork dispatch 执行，与 ADR-0007 兼容）
5. THE `dist-plugin/` SHALL 重建以反映新结构，不含旧 forge-loop CLI 产物

## 正确性属性

1. **调度不泄漏**：每个 ScheduleWakeup/CronCreate 调用都有对应的 loop state 文件；不存在孤立 cron 任务
2. **状态一致**：loop state JSON 的 `phase` 始终与 `.tinkerman/` 目录下的实际工作产物（spec、plan、review 结果等）一致
3. **Git 干净**：`complete` 状态下工作区干净（所有修改已提交）；`halted` 状态下工作区回滚到 `lastSuccessCommit`
4. **幂等恢复**：对同一 loop id 多次执行 `/forge loop continue {id}` 结果相同（不重复执行已完成的阶段）

## 非功能性需求

1. **代码量**：新 loop skill instructions.md ≤ 300 行（不含 references）
2. **零额外依赖**：不引入新 npm 包、不引入 Tauri、不引入独立二进制
3. **分发兼容**：通过 `/plugin install forge` 一次性获得 loop 功能
4. **平台兼容**：在 claude.ai 上使用 ScheduleWakeup（动态调度）；在 Bedrock/Vertex 上 fallback 到 CronCreate（固定间隔）

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| ScheduleWakeup 在 context compaction 后行为异常 | 中 | 高 | loop state 持久化到 `.tinkerman/progress/`；`--resume` + `/forge loop continue` 恢复 |
| GitHub #61492 cron 触发时丢失 skill 上下文 | 高 | 中 | prompt 固定为 `/forge loop continue {id}`，每次触发重新加载 skill |
| Bedrock/Vertex 不支持 ScheduleWakeup | 确定 | 低 | fallback 到 CronCreate 固定间隔（60s） |
| 旧 forge-loop 用户迁移成本 | 低 | 低 | 入口从 CLI 变为 `/forge loop`，概念不变；旧 CLI 标记 deprecated |
