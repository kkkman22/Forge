---
id: "ADR-0002"
title: "Capability Library 化范围决策：哪些 skill 抽象、哪些保留、哪些观察"
status: accepted
date: "2026-05-14"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0001"
---

# ADR-0002: Capability Library 化范围决策

## Context

Forge 在 v2.5/v2.6 完成了 4 个能力库化 spec（`zoom-out-auto-trigger` / `refactor-fix-into-build-mode` / `conflict-resolver-hook` / `grill-auto-trigger-and-inline`），形成了一个清晰的架构方向：**能力库化 + 触发自动化**。

为防止下一阶段陷入"看到重复就抽象"的过度工程，需要一份正式的范围决策——明确：

1. 哪些 skill 应该继续走能力库化路径（已起 spec）
2. 哪些 skill 暂时记录但不立即评估（Tier 3 候选）
3. 哪些 skill 永远保持现状（反模式：明确不 library-ize）

本 ADR 是 2026-05-14 系统性扫描（29 个 skill + 130+ src 模块 + 17 个现有 spec）的结论沉淀，作为后续讨论的基线。每个 Tier 3 候选附带"重新评估触发条件"，避免无限期搁置。

## Decision

### Tier 1：立即起 spec（已完成）

下列 4 个候选已生成 spec 并按推荐顺序排队实施：

| # | Spec | 路径 | 风险 |
|---|------|------|------|
| 1 | Failure-Sink 触发面扩张 | `.tinkerman/specs/failure-sink-trigger-expansion/` | 极低（仅 enum 扩展） |
| 2 | Branch Topic Gate Hook | `.tinkerman/specs/branch-topic-gate-hook/` | 低（已有完整库） |
| 3 | Glossary 一致性 Hook | `.tinkerman/specs/glossary-consistency-hook/` | 低 |
| 4 | Spec-health Hook | `.tinkerman/specs/spec-health-hook/` | 中（与 grill-auto-trigger 强关联） |

### Tier 2：v2.7 排期（已修订）

经过 2026-05-14 的二次深度评估（基于 Tier 1 spec 实施风险分析），原 4 个 Tier 2 候选**修订为 2 个起 spec、2 个降级到 Tier 3**。详见后续"二次评估说明"章节。

#### Tier 2 已起 spec（2 个）

| # | Spec | 路径 | 关键价值 |
|---|------|------|----------|
| T2-1 | Knowledge Integrity / Catalog 自动 Hook | `.tinkerman/specs/knowledge-hooks-auto-rebuild/` | 事件驱动 catalog 刷新，让 plan/build/decide 研究阶段命中率最大化 |
| T2-2 | AtomicTask dependsOn 字段利用 | `.tinkerman/specs/atomic-task-depends-on-utilization/` | 解决 ROADMAP L-16，让 plan 输出图数据为下游评估提供基础 |

#### 二次评估说明：从 Tier 2 降级的 2 个候选

##### Debug 自动触发面扩张 → Tier 3

**原候选**：test layer 失败 / review P0 架构变更 / fix-conflicts 验证失败时自动启动 debug 4 阶段诊断。

**降级理由**：
- failure-sink-trigger-expansion（Tier 1 spec 1）已经覆盖"失败信号沉淀"这个真痛点
- "自动暂停主流程进入诊断"是高昂动作，自动触发会破坏 Forge Loop 节奏
- 当前 build 的 three-strike 升级路径已经覆盖大部分场景
- 反模式风险高（触发链过长 + autonomous 模式硬阻塞）
- 边际价值仅是 UX 改进（用户不用手动跑 `/forge debug`），不是能力补充

**替代方案**：在 review SKILL.md 加一行 prompt——"P0+架构变更时建议下一步运行 `/forge debug`"。零代码即可达成 90% 价值。

**重新评估触发条件**：
- review 阶段 P0+架构变更后用户**未跑** debug 的比例 > 50%（来自使用率 metrics）
- failure-sink 数据显示有大量"应启动诊断但未启动"的失败模式

##### Verify 自动触发面扩张 → Tier 3

**原候选**：test Layer 3 / build 任务完成 claim 落盘 / accept 场景验证时自动跑 verify。

**降级理由**：
- verify 是同步 IO orchestrator，单次成本 5-30 秒（涉及 git 切换 + baseline 捕获）
- 一次 build 可能 5-15 个任务，全量自动 verify 等于 25 秒-7.5 分钟纯开销 / build
- 与 Forge Loop 吞吐量直接冲突
- verify 的核心价值依赖用户**意识到需要证据**，自动化稀释这个价值
- 多数 build 任务完成不需要严格证据链（开发者凭直觉确认）
- 反模式风险极高（autonomous 模式硬阻塞 + 时间型缓存）

**替代方案**：在 build / test SKILL.md 加可选的 `--with-verify` flag，让用户在关键任务上显式开启。

**重新评估触发条件**：
- "build 任务完成后需要 verify"的需求被多个用户主动反馈 ≥ 5 次
- verify 的执行成本通过 baseline 缓存优化降低到 < 2 秒（需要单独优化 spec）

##### Plan 任务图 Hook → 拆分为 atomic-task-depends-on-utilization spec

**原候选**：task-graph.ts 推广到 build/loop 共用，让 build 多任务可以并行执行。

**调整理由**：
- task-graph.ts 当前是孤儿模块（只在测试中引用）
- 真正的瓶颈是 plan 不输出图数据（dependsOn 字段已存在但未填充）
- 让 build/loop 消费图的复杂度引入大于收益（性能瓶颈在 LLM 推理）
- 强行普及 = 为抽象而抽象（反模式 1：过度抽象）

**调整后**：
- 起 spec `atomic-task-depends-on-utilization`：仅做 plan 输出图数据 + Self-Check 校验
- **不**普及 task-graph 到 build / loop 生产消费
- task-graph 保持当前状态（库已成熟，作为未来评估的 infrastructure 预留）

### Tier 3：记录但不立即评估

下列 6 个候选**当前阶段做不划算**，但有未来重启评估的合理触发条件。前 4 个为初次扫描的结论，后 2 个为 Tier 2 二次评估降级的候选。

#### Tier 3 候选 #1：Chat-preference-extractor 自动触发

- **保留显式触发的理由**：PII 误抓风险 + 偏好误判风险 + 已有 Claude Code Auto Memory 覆盖会话级偏好
- **重新评估触发条件**：
  - Claude Code Auto Memory 弃用或重大变更（每季度跟踪）
  - 用户主动请求"会话开始时自动加载偏好"且能提供同意机制（opt-in）
  - 项目级偏好（不涉及 PII）有明确边界划分

#### Tier 3 候选 #2：Error-recovery 自动 Hook

- **保留显式触发的理由**：1130 行复杂逻辑 + 自动跑产生"幽灵建议"（多数 skill 启动是正常场景，自动 reconciliation 误警）
- **重新评估触发条件**：
  - 实际 error-recovery 调用频次数据（来自使用率 metrics）显示用户在非 resume 场景也手动调用 `/forge resume` 的次数 > 20%
  - error-recovery 输出的 reconciliation patch 误报率 < 5%（PBT 验证）
  - 出现明确的"中断检测"信号（如 git state 与 status.md 三方明显不一致）可以作为自动触发条件

#### Tier 3 候选 #3：Prompt-defense / Sandbox-policy 自动 Hook

- **保留现状的理由**：已在 Claude Code 平台层（hooks.json PreToolUse）处理；Forge 层加一层是双重过滤、性能浪费、责任边界混乱
- **重新评估触发条件**：
  - Claude Code 平台层 hook 机制大幅变更或弃用
  - 出现 Forge 特有的安全场景（如 frozen zone 保护）需要应用层补充检查
  - 安全审计要求多层防御（defense-in-depth）的明确合规需求

#### Tier 3 候选 #4：Performance-tracker 全 skill 推广

- **保留 Loop 局部使用的理由**：性能数据涉及隐私 trade-off；可观测性应该是 opt-in；当前 Loop 内部的熔断决策是合理的局部反馈循环
- **重新评估触发条件**：
  - v3.0 Events_NDJSON 多消费者扩展完成（已就位的字节游标协议）
  - opt-in 隐私同意机制建立（用户明确选择"开启 forge 性能可观测性"）
  - 性能数据消费者（IDE 插件 / Web Dashboard / CI 报告器）有正式合约

#### Tier 3 候选 #5：Debug 自动触发面扩张（Tier 2 降级）

- **保留显式触发的理由**：见上方"二次评估说明"中的降级分析
- **重新评估触发条件**：
  - review 阶段 P0+架构变更后用户**未跑** debug 的比例 > 50%
  - failure-sink 数据显示大量"应启动诊断但未启动"的失败模式

#### Tier 3 候选 #6：Verify 自动触发面扩张（Tier 2 降级）

- **保留显式触发的理由**：见上方"二次评估说明"中的降级分析
- **重新评估触发条件**：
  - "build 任务完成后需要 verify"的需求被多个用户主动反馈 ≥ 5 次
  - verify 单次执行成本通过 baseline 缓存优化降到 < 2 秒

### 反模式：明确不 library-ize（永久保留现状）

下列 11 个 skill **不应该被进一步抽象**——它们的本质属性是 orchestration、对话、平台兼容、用户决策，不是可复用能力。

| Skill | 本质属性 | 不抽象的核心理由 |
|-------|----------|------------------|
| `forge-router` | 入口编排 | router 已是能力库的消费者；进一步抽象会破坏其作为入口对话的清晰角色 |
| `forge-storm` | 用户驱动对话流 | DDD 事件风暴的价值在于"用户陪 AI 走完"，而非 AI 自动跑完 |
| `forge-decide-teams` | PoC | 跟踪官方 Agent Teams 实验，价值是"可丢弃"，抽象意味着稳定承诺 |
| `forge-pack` | 离散用户决策 | 子命令式生命周期管理，自动触发会让 pack 启停失控 |
| `forge-status` | 只读查询 | 已是最小实现，无逻辑可抽 |
| `forge-abort` | 已委托 | v2.5 已委托给 Claude Code 原生 abort |
| `forge-recap` | 已委托 | v2.5 已委托给 `/compact` + `/context` |
| `forge-zoom-out` | 已是被自动触发的能力 | 核心逻辑已纯函数化，不需要再抽一层 |
| `forge-mutate` | pack-conditional | 自动触发会浪费 stryker 运行成本（分钟级） |
| `forge-control-cli` / `forge-control-ui` | Harness adapter | 已有 4-tier 降级，强行抽到主线会破坏 harness 选择策略 |
| `forge-build-light` | 表面相似实质不同 | 与 build 共享 70% 行为但断点不同，强行合并维护成本反升 |

### 通用反模式（设计时警惕，不起 spec）

下列 5 个反模式作为**设计准则**写入 steering 文件 `.claude/rules/hook-design-principles.md`，每个新 hook spec 的"风险与缓解"章节强制对照：

1. **过度抽象**（Loss of context-specific behavior）
2. **触发链过长**（Debugging difficulty）
3. **状态管理复杂度上升**（Too many flags to track）
4. **autonomous 模式硬阻塞**（违反 Forge Loop 核心契约）
5. **缓存不依据语义而依据时间**（隐性 bug）

## Consequences

### Positive

- **范围明确**：4 个 Tier 1 spec 已起，11 个反模式 skill 永久保留，4 个 Tier 3 候选有明确重启条件——后续讨论以本 ADR 为基线，不需要重新评估
- **避免过度工程**：明确"什么不做"的清单和理由，防止"看到重复就抽象"的反射式动作
- **设计准则可复用**：5 个通用反模式抽成 steering，每个新 hook 自检环节强制对照
- **重新评估有据可循**：每个 Tier 3 候选附带具体触发条件，未来何时重启不需要靠记忆
- **抽象成本可控**：从扫描结果看，Tier 1 实施可消除约 80 LoC 散落 prompt 渲染 + 5 个 skill 缺失的失败沉淀 + 7 个 skill 缺失的 branch gate

### Negative

- **不抽象的代价**：11 个反模式 skill 中的若干（如 forge-build-light 与 forge-build 70% 重叠）维护时仍需双份维护
- **Tier 3 重启需要主动跟踪**：触发条件依赖人工监控（如"Claude Code Auto Memory 弃用"），缺乏自动化触发机制
- **steering 文件维护成本**：通用反模式准则需要随实践演进更新，否则可能与新 spec 实践脱节
- **决策固化风险**：本 ADR 把当前判断写死，未来若 Forge 架构方向转变（如转向 plugin 生态），部分反模式分类可能需要重新评估

## 重新评估周期

每 6 个月（或主版本 v2.7 / v3.0 启动时）review 本 ADR：
- Tier 3 候选的"重启触发条件"是否已满足
- 反模式 skill 的"不抽象理由"是否仍然成立
- 通用反模式准则是否需要新增或调整

review 结果通过新 ADR（supersedes 本 ADR）记录，本 ADR 不直接修改。
