---
feature: forge-loop-native-fusion
layout: tasks
created: 2026-06-01
spec_ref: ".tinkerman/specs/forge-loop-native-fusion/requirements.md"
---

# Tasks: Forge Loop 原生融合

## Wave 0: 预验证 Spike

### Task 0.1: ScheduleWakeup 动态调度 Spike
- [ ] 0.1.1 在 Claude Code 会话内通过 Skill tool 调用 ScheduleWakeup，prompt 设为 `/forge loop continue test123`，验证 cron 触发后是否能重新进入 Forge skill
- [ ] 0.1.2 验证 ScheduleWakeup 触发时 skill 上下文是否完整加载（instructions.md 是否被读取）
- [ ] 0.1.3 验证 context compaction 后 ScheduleWakeup 任务是否仍然触发

**RED**: 手动测试脚本，记录 ScheduleWakeup 行为
**GREEN**: 产出 `.tinkerman/findings/schedulewakeup-spike.md`，含实测结果和 verdict
**REFACTOR**: N/A（spike 不产出生产代码）
**Verify-By**: manual + 产出 findings 文档
**关联需求**: R1, R5

### Task 0.2: CronCreate Fallback Spike
- [ ] 0.2.1 模拟 Bedrock/Vertex 环境（`CLAUDE_CODE_DISABLE_CRON=1` 不设），验证 CronCreate 的固定间隔调度能否替代 ScheduleWakeup
- [ ] 0.2.2 验证 CronCreate 的 prompt 参数为 `/forge loop continue {id}` 时，触发后 skill 上下文加载正确性

**RED**: 手动测试脚本
**GREEN**: 产出 `.tinkerman/findings/croncreate-fallback-spike.md`
**REFACTOR**: N/A
**Verify-By**: manual + 产出 findings 文档
**关联需求**: R4.2, R5

---

## Wave 1: 核心实现（RED → GREEN → REFACTOR）

### Task 1.1: Loop State Schema 定义
- [ ] 1.1.1 定义 `.tinkerman/progress/loop-{id}.json` 的 JSON Schema（含所有 C1 字段）
- [ ] 1.1.2 编写 `test/loop/state-schema.test.ts`：验证 schema 覆盖所有必需字段、类型正确
- [ ] 1.1.3 创建 `.tinkerman/templates/loop-state.json` 作为初始模板

**RED**: 先写测试，断言 schema 校验有效/无效 JSON
**GREEN**: 实现 schema 定义，测试通过
**REFACTOR**: 确保字段命名与 Forge 其他 state 文件风格一致
**Verify-By**: vitest
**关联需求**: R1.1, R2.1, R3.1

### Task 1.2: 阶段流转逻辑
- [ ] 1.2.1 编写 `test/loop/phase-transition.test.ts`：覆盖所有 tier × phase 组合的流转正确性
- [ ] 1.2.2 编写 `test/loop/phase-transition.test.ts`：覆盖 review P0/P1 → build 回退路径
- [ ] 1.2.3 在 loop skill instructions.md 中实现阶段流转表（design C2）

**RED**: 先写测试，断言每种 tier/phase 组合的期望下一阶段
**GREEN**: 实现 instructions.md 中的流转逻辑，测试通过
**REFACTOR**: 流转表格式清晰、可维护
**Verify-By**: vitest
**关联需求**: R2.2, R2.4

### Task 1.3: Three-strike 检测与 Git 事务
- [ ] 1.3.1 编写 `test/loop/three-strike.test.ts`：覆盖 consecutiveFailures 递增、≥3 触发 halt、Git 回滚命令生成
- [ ] 1.3.2 编写 `test/loop/three-strike.test.ts`：覆盖 lastSuccessCommit 未设置时的 stash fallback
- [ ] 1.3.3 编写 `test/loop/three-strike.test.ts`：覆盖成功时 consecutiveFailures 重置 + git commit 命令生成
- [ ] 1.3.4 在 loop skill instructions.md 中实现 Three-strike 和 Git 事务逻辑（design C3, C4）

**RED**: 先写测试
**GREEN**: 实现 instructions.md 中的相关章节
**REFACTOR**: Git 命令提取为可复用的 Bash 片段
**Verify-By**: vitest
**关联需求**: R3

### Task 1.4: 调度策略实现
- [ ] 1.4.1 编写 `test/loop/scheduling-strategy.test.ts`：覆盖 delaySeconds 选择逻辑（失败次数 × 阶段组合）
- [ ] 1.4.2 编写 `test/loop/scheduling-strategy.test.ts`：覆盖 delaySeconds > 3600 时 fallback 到 CronCreate
- [ ] 1.4.3 在 loop skill instructions.md 中实现调度策略表（design C3）

**RED**: 先写测试
**GREEN**: 实现 instructions.md 中的调度章节
**REFACTOR**: 确保策略表易读、易扩展
**Verify-By**: vitest
**关联需求**: R4

### Task 1.5: stopWhen 条件终止
- [ ] 1.5.1 编写 `test/loop/stopwhen-evaluation.test.ts`：覆盖条件评估为 true/false/uncertain 三种情况
- [ ] 1.5.2 在 loop skill instructions.md 中实现 stopWhen 评估逻辑

**RED**: 先写测试
**GREEN**: 实现
**REFACTOR**: 条件评估逻辑抽象为独立章节
**Verify-By**: vitest
**关联需求**: R6

### Task 1.6: Loop Skill Instructions.md 完整实现
- [ ] 1.6.1 编写 `skills/forge/lib/loop/instructions.md` frontmatter（description, dispatch_mode: fork, allowed_tools）
- [ ] 1.6.2 实现入口路由章节（/forge loop, /forge loop continue, /forge loop status, /forge loop abort）
- [ ] 1.6.3 实现初始化流程章节（创建 state → tier 路由 → 分支创建 → 启动首阶段）
- [ ] 1.6.4 实现迭代决策循环章节（整合 Task 1.2-1.5 的所有逻辑）
- [ ] 1.6.5 实现诊断与总结章节（输出格式、phase history 读取）
- [ ] 1.6.6 实现平台兼容章节（ScheduleWakeup 不可用 → CronCreate fallback）
- [ ] 1.6.7 编写 `test/loop/dispatch-mode.test.ts`：验证 frontmatter dispatch_mode: fork
- [ ] 1.6.8 编写 `test/loop/allowed-tools.test.ts`：验证 allowed_tools 包含所有调度工具

**RED**: 先写 frontmatter 契约测试（1.6.7, 1.6.8）
**GREEN**: 完整实现 instructions.md
**REFACTOR**: 确保 instructions.md ≤ 300 行（不含 references）
**Verify-By**: vitest
**关联需求**: R1, R4, R5

---

## Wave 2: 旧系统退役 + 迁移

### Task 2.1: 删除旧源码
- [ ] 2.1.1 删除 `src/forge-loop-cli.ts`
- [ ] 2.1.2 删除 `src/loop-types.ts`、`src/loop-error-controller.ts`、`src/verify-loop.ts`、`src/retry-loop.ts`、`src/loop-index.ts`
- [ ] 2.1.3 删除 `scripts/persistent-loop.sh`
- [ ] 2.1.4 删除 Desktop App 相关目录
- [ ] 2.1.5 清理 `package.json` 中 forge-loop 相关的 bin/exports 条目
- [ ] 2.1.6 编写 `test/loop/no-legacy-imports.test.ts`：grep 仓库确认无残留引用

**RED**: 先写 no-legacy-imports 测试（当前应 FAIL，因旧代码仍在）
**GREEN**: 删除所有旧文件，测试通过
**REFACTOR**: 确认无其他文件 import 被删模块
**Verify-By**: vitest + `git diff --stat`
**关联需求**: R7.1

### Task 2.2: 删除/重写旧测试
- [ ] 2.2.1 删除 `test/forge-loop-cli.test.ts`、`test/verify-loop.test.ts`、`test/retry-loop.test.ts`
- [ ] 2.2.2 删除 `test/loop-integration.test.ts`、`test/loop-skill-integration.test.ts`、`test/loop-orchestrator.property.test.ts`
- [ ] 2.2.3 验证 `test/loop/*.test.ts`（新测试）覆盖率 ≥ 被删测试的核心场景

**Verify-By**: vitest（新测试全绿 + 旧测试已删）
**关联需求**: R7.2

### Task 2.3: 更新文档与引用
- [ ] 2.3.1 更新 `ROADMAP.md`：loop 从"护城河"调整为"轻量 skill"，删除 Desktop App / npm 包相关描述
- [ ] 2.3.2 更新 `CHANGELOG.md`：新增 breaking change 条目
- [ ] 2.3.3 更新 `docs/reference-commands.md`：loop 命令文档重写
- [ ] 2.3.4 更新 `.tinkerman/decisions/ADR-0007`：追加 Update 段，标注 loop 架构变更（调度从自建 → 原生）
- [ ] 2.3.5 验证 `.tinkerman/glossary.md` 中 loop 相关术语与新方案一致

**Verify-By**: manual review
**关联需求**: R7.3, R7.4

### Task 2.4: 重建 dist-plugin
- [ ] 2.4.1 运行 `scripts/gen-plugin-commands.mjs` 和 `scripts/regen-skill-registry.mjs`，确保 loop skill 注册正确
- [ ] 2.4.2 验证 `dist-plugin/skills/forge/lib/loop/instructions.md` 内容与源文件一致
- [ ] 2.4.3 验证 `dist-plugin/` 不含旧 forge-loop CLI 产物
- [ ] 2.4.4 运行 `scripts/build-lib-manifest.mjs` 更新 manifest.json

**Verify-By**: bash（build 脚本成功 + diff 验证）
**关联需求**: R7.5

---

## Wave 3: 集成验证

### Task 3.1: 端到端 Smoke Test
- [ ] 3.1.1 场景 1：`/forge loop "修复所有 lint 错误"` → Light tier → build → review → ship → complete
- [ ] 3.1.2 场景 2：`/forge loop "为用户 API 添加分页"` → Standard tier → plan → build → review → test → ship → learn → complete
- [ ] 3.1.3 场景 3：故意制造连续 3 次失败 → Three-strike → halted + Git 回滚
- [ ] 3.1.4 场景 4：`--stop-when "所有测试通过"` → 条件满足后自动终止
- [ ] 3.1.5 场景 5：关闭终端 → `claude --resume` → `/forge loop continue {id}` 恢复

**Verify-By**: manual（每个场景记录结果到 `.tinkerman/findings/loop-smoke-{scenario}.md`）
**关联需求**: R1-R6

### Task 3.2: 市场分发验证
- [ ] 3.2.1 在干净环境中 `plugin install forge` → 验证 `/forge loop` 可用
- [ ] 3.2.2 验证 `/forge loop status`、`/forge loop abort` 子命令可用
- [ ] 3.2.3 验证无旧 forge-loop CLI 残留（`which forge-loop` 无结果）

**Verify-By**: manual
**关联需求**: R7

### Task 3.3: 回归验证
- [ ] 3.3.1 运行 `test/loop/*.test.ts` 全部通过
- [ ] 3.3.2 运行 `test/single-entry/*.test.ts` 确认 dispatcher 未受影响
- [ ] 3.3.3 运行 `test/contract.test.ts` 确认 skill 路径引用正确
- [ ] 3.3.4 运行 `test/contract.skills.test.ts` 确认 allowed_tools 注册正确
- [ ] 3.3.5 全仓 `vitest` 运行，零失败

**Verify-By**: vitest
**关联需求**: all
