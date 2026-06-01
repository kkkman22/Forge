---
feature: forge-loop-native-fusion
status: locked
date: 2026-06-01
runtime: kiro
import_source: ".kiro/specs/forge-loop-native-fusion/requirements.md"
related_adrs:
  - "ADR-0007 (extends)"
  - "ADR-0004 (within)"
acceptance_eval: false
plan_deviation_from_spec:
  - section: "design.md 删除清单"
    original: "直接删除 loop-types.ts"
    actual: "loop-types.ts 是核心共享类型库，被 9 个核心模块导入。需拆分而非直接删除。"
---

# Plan: Forge Loop 原生融合

## Wave 0: Spike 预验证

### Task 0.1: ScheduleWakeup 调度 Spike
- [ ] 0.1.1 在 Claude Code 会话内通过 Skill tool 调用 ScheduleWakeup，prompt 设为 `/forge loop continue test123`，验证 cron 触发后是否能重新进入 Forge skill
- [ ] 0.1.2 验证 ScheduleWakeup 触发时 skill 上下文是否完整加载
- [ ] 0.1.3 验证 context compaction 后 ScheduleWakeup 任务是否仍然触发

**RED**: 手动测试脚本，记录行为
**GREEN**: 产出 `.forge/findings/schedulewakeup-spike.md`
**REFACTOR**: N/A（spike）
**Verify-By**: manual + findings 文档
**关联需求**: R1, R5

### Task 0.2: CronCreate Fallback Spike
- [ ] 0.2.1 验证 CronCreate 固定间隔调度 prompt `/forge loop continue {id}` 时 skill 上下文加载正确性

**RED**: 手动测试
**GREEN**: 产出 `.forge/findings/croncreate-fallback-spike.md`
**REFACTOR**: N/A
**Verify-By**: manual + findings 文档
**关联需求**: R4, R5

---

## Wave 1: 类型拆分（前提条件）

### Task 1.1: 拆分 loop-types.ts — 迁移核心共享类型
- [ ] 1.1.1 创建 `test/types/types-migration.test.ts`：断言核心共享类型（`SubagentInvocation`, `SubagentResult`, `ParallelExecutionResult`, `PendingDeliveryRecord`, `TokenUsage`, `WorktreeDecision`, `BranchTopicGateResult`, `CommitTopicCheckResult`）在新位置可导入
- [ ] 1.1.2 创建 `src/types.ts`（或追加到现有合适模块），迁移上述 8 个核心共享类型
- [ ] 1.1.3 更新 9 个核心模块的 import 路径：`build.ts`, `review.ts`, `decide.ts`, `branch-gate.ts`, `subagent-runner.ts`, `review-final-block.ts`, `stream-json-adapter.ts`, `worktree-manager.ts`, `index.ts`
- [ ] 1.1.4 验证 `npm run check` 通过

**RED**: 先写测试，断言新 import 路径可解析
**GREEN**: 迁移类型，更新 imports，测试通过
**REFACTOR**: 确保类型命名和文档注释保持一致
**Verify-By**: vitest + `npm run check`
**关联需求**: R7.1（修正：loop-types.ts 拆分而非直接删除）
**dependsOn**: []

---

## Wave 2: Loop Skill 重写

### Task 2.1: Loop State JSON Schema
- [ ] 2.1.1 编写 `test/loop/state-schema.test.ts`：验证 loop state schema 覆盖所有必需字段（id, goal, phase, consecutiveFailures, totalIterations, tier, lastSuccessCommit, branch, stopWhen, lastScheduledAt, nextScheduledReason, createdAt, phaseHistory, lastReviewResult, haltReason）
- [ ] 2.1.2 创建 `.forge/templates/loop-state.json` 作为初始模板

**RED**: 先写测试
**GREEN**: 创建 schema 模板
**REFACTOR**: 字段命名与 Forge 其他 state 文件一致
**Verify-By**: vitest
**关联需求**: R1.1, R2.1, R3.1
**dependsOn**: []

### Task 2.2: 阶段流转逻辑
- [ ] 2.2.1 编写 `test/loop/phase-transition.test.ts`：覆盖所有 tier × phase 组合 + review P0/P1 → build 回退
- [ ] 2.2.2 实现流转表（内嵌在 skill instructions 中）

**RED**: 先写测试
**GREEN**: 实现
**REFACTOR**: 流转表可读
**Verify-By**: vitest
**关联需求**: R2.2, R2.4
**dependsOn**: []

### Task 2.3: Three-strike 与 Git 事务
- [ ] 2.3.1 编写 `test/loop/three-strike.test.ts`：覆盖 consecutiveFailures 递增、≥3 halt、Git 回滚、成功重置+commit
- [ ] 2.3.2 实现 instructions.md 中相关章节

**RED**: 先写测试
**GREEN**: 实现
**REFACTOR**: Git 命令为可复用片段
**Verify-By**: vitest
**关联需求**: R3
**dependsOn**: [2.1]

### Task 2.4: 调度策略
- [ ] 2.4.1 编写 `test/loop/scheduling-strategy.test.ts`：覆盖 delaySeconds 选择（失败次数 × 阶段）+ CronCreate fallback
- [ ] 2.4.2 实现 instructions.md 中调度章节

**RED**: 先写测试
**GREEN**: 实现
**REFACTOR**: 策略表可扩展
**Verify-By**: vitest
**关联需求**: R4
**dependsOn**: []

### Task 2.5: stopWhen 条件终止
- [ ] 2.5.1 编写 `test/loop/stopwhen-evaluation.test.ts`
- [ ] 2.5.2 实现 instructions.md 中 stopWhen 章节

**RED**: 先写测试
**GREEN**: 实现
**REFACTOR**: 条件评估抽象为独立章节
**Verify-By**: vitest
**关联需求**: R6
**dependsOn**: []

### Task 2.6: Loop Skill Instructions.md 完整重写
- [ ] 2.6.1 重写 `skills/forge/lib/loop/instructions.md` frontmatter（dispatch_mode: fork, allowed_tools 含 ScheduleWakeup/CronCreate/CronDelete/CronList）
- [ ] 2.6.2 实现入口路由（/forge loop, /forge loop continue, /forge loop status, /forge loop abort）
- [ ] 2.6.3 实现初始化流程（创建 state → tier 路由 → 分支创建 → 首阶段）
- [ ] 2.6.4 整合 Task 2.2-2.5 的所有逻辑到迭代决策循环
- [ ] 2.6.5 实现诊断与总结、平台兼容章节
- [ ] 2.6.6 编写 `test/loop/dispatch-mode.test.ts` + `test/loop/allowed-tools.test.ts`

**RED**: 先写 frontmatter 契约测试
**GREEN**: 完整重写 instructions.md（≤ 300 行）
**REFACTOR**: 确保 instructions 简洁
**Verify-By**: vitest
**关联需求**: R1-R6
**dependsOn**: [2.2, 2.3, 2.4, 2.5]

---

## Wave 3: 旧系统退役

### Task 3.1: 删除 Loop 专用模块
- [ ] 3.1.1 删除 `src/forge-loop-cli.ts`（1,133 行）
- [ ] 3.1.2 删除 `src/loop-index.ts`（141 行）
- [ ] 3.1.3 删除 `src/loop-error-controller.ts`（210 行）
- [ ] 3.1.4 删除 `src/verify-loop.ts`（168 行）
- [ ] 3.1.5 删除 `src/retry-loop.ts`（94 行）
- [ ] 3.1.6 删除 `scripts/persistent-loop.sh`（581 行）

**RED**: 先写 no-legacy-imports 测试（当前 FAIL）
**GREEN**: 删除文件，测试通过
**REFACTOR**: 确认无残留 import
**Verify-By**: vitest + `git diff --stat`
**关联需求**: R7.1
**dependsOn**: [1.1]

### Task 3.2: 删除 SDK/Orchestrator 模块
- [ ] 3.2.1 删除 `src/orchestrator.ts`
- [ ] 3.2.2 删除 `src/effect-executor.ts`
- [ ] 3.2.3 删除 `src/sdk-driver.ts`, `src/sdk-agent-adapter.ts`, `src/cli-subprocess-driver.ts`
- [ ] 3.2.4 删除 `src/sdk-commit-strategy.ts`, `src/sdk-notes-manager.ts`, `src/sdk-generic-iteration.ts`, `src/sdk-skill-iteration.ts`, `src/sdk-driver-types.ts`
- [ ] 3.2.5 删除 `src/context-accumulator.ts`, `src/completion-reporter.ts`, `src/agent-registry.ts`, `src/agent-output.ts`, `src/agent-adapter.ts`, `src/mock-agent-adapter.ts`
- [ ] 3.2.6 删除 `src/failure-handler.ts`, `src/sleep-preventer.ts`, `src/git-transaction.ts`, `src/branch-lifecycle.ts`, `src/event-log.ts`
- [ ] 3.2.7 删除 `src/loop-types.ts`（核心类型已在 Task 1.1 迁出）
- [ ] 3.2.8 更新 `src/index.ts` 移除所有已删模块的 export

**RED**: vitest 编译测试（当前 FAIL）
**GREEN**: 删除 + 更新 exports
**REFACTOR**: 确认 index.ts 干净
**Verify-By**: vitest + `npm run check`
**关联需求**: R7.1
**dependsOn**: [1.1, 3.1]

### Task 3.3: 删除旧测试
- [ ] 3.3.1 删除 `test/forge-loop-cli.test.ts`（1,545 行）
- [ ] 3.3.2 删除 `test/verify-loop.test.ts`, `test/retry-loop.test.ts`
- [ ] 3.3.3 删除 `test/loop-integration.test.ts`, `test/loop-skill-integration.test.ts`, `test/loop-orchestrator.property.test.ts`
- [ ] 3.3.4 删除 `test/loop-error-controller/loop-error-controller.test.ts`

**Verify-By**: vitest（新测试覆盖核心场景）
**关联需求**: R7.2
**dependsOn**: [3.2]

### Task 3.4: 删除 Desktop App
- [ ] 3.4.1 删除 `apps/forge-loop-desktop/` 整个目录

**Verify-By**: `ls apps/forge-loop-desktop/` → 不存在
**关联需求**: R7.1
**dependsOn**: []

### Task 3.5: 清理 package.json
- [ ] 3.5.1 移除 `package.json` 中 `bin.forge-loop` 条目
- [ ] 3.5.2 移除 `files` 中 `dist/src/` 限定（如不再需要）
- [ ] 3.5.3 编写 `test/loop/no-legacy-imports.test.ts`：grep 仓库确认无残留引用

**Verify-By**: vitest + `npm run check`
**关联需求**: R7.1
**dependsOn**: [3.1, 3.2, 3.3]

### Task 3.6: 更新文档与 ADR
- [ ] 3.6.1 更新 `ROADMAP.md`：loop 定位调整
- [ ] 3.6.2 更新 `CHANGELOG.md`：breaking change 条目
- [ ] 3.6.3 更新 `.forge/decisions/ADR-0007`：追加 Update 段
- [ ] 3.6.4 重建 `dist-plugin/` 并验证

**Verify-By**: manual review
**关联需求**: R7.3, R7.4, R7.5
**dependsOn**: [2.6, 3.5]

---

## Wave 4: 集成验证

### Task 4.1: Smoke Tests
- [ ] 4.1.1 场景 1：Light tier `build → review → ship`
- [ ] 4.1.2 场景 2：Standard tier `plan → build → review → test → ship → complete`
- [ ] 4.1.3 场景 3：Three-strike → halted + Git 回滚
- [ ] 4.1.4 场景 4：stopWhen 条件终止
- [ ] 4.1.5 场景 5：关闭终端 → `--resume` → `/forge loop continue {id}`

**Verify-By**: manual（记录到 `.forge/findings/loop-smoke-{n}.md`）
**关联需求**: R1-R6
**dependsOn**: [3.6]

### Task 4.2: 回归验证
- [ ] 4.2.1 `vitest run` 全仓零失败
- [ ] 4.2.2 `npm run check` 通过
- [ ] 4.2.3 `test/single-entry/*.test.ts` dispatcher 未受影响
- [ ] 4.2.4 市场分发验证：`/plugin install forge` → `/forge loop` 可用

**Verify-By**: vitest + manual
**关联需求**: all
**dependsOn**: [4.1]
