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
| 1 | Failure-Sink 触发面扩张 | `.forge/specs/failure-sink-trigger-expansion/` | 极低（仅 enum 扩展） |
| 2 | Branch Topic Gate Hook | `.forge/specs/branch-topic-gate-hook/` | 低（已有完整库） |
| 3 | Glossary 一致性 Hook | `.forge/specs/glossary-consistency-hook/` | 低 |
| 4 | Spec-health Hook | `.forge/specs/spec-health-hook/` | 中（与 grill-auto-trigger 强关联） |

### Tier 2：v2.7 排期评估

下列 4 个候选有价值但复杂度中等，等 Tier 1 实施完后基于使用率数据决定是否起 spec：

| 候选 | 触发面扩张方向 | 关键风险 |
|------|----------------|----------|
| Debug 自动触发 | test layer 失败 / review P0 架构变更 / fix-conflicts 验证失败 | 频率控制，避免过度暂停主流程 |
| Verify 自动触发 | test Layer 3 / build 任务完成 claim 落盘 / accept 场景验证 | IO 开销，需 autonomous 采样而非全量 |
| Plan 任务图 Hook | task-graph 推广到 build/loop 共用 | plan 缺失时 fallback 复杂度 |
| Knowledge Integrity / Catalog 自动 Hook | episode 累积自动 rebuild instincts | catalog 重建 IO 节流 |

### Tier 3：记录但不立即评估

下列 4 个候选**当前阶段做不划算**，但有未来重启评估的合理触发条件。

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
