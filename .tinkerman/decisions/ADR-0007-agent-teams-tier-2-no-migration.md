---
id: "ADR-0007"
title: "Tier 2 — review / build / loop never migrate to Agent Teams"
status: accepted
date: "2026-05-24"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0002"
---

# ADR-0007: Tier 2 — review / build / loop never migrate to Agent Teams

## Context

Claude Code 在 2026-02 推出 Agent Teams 实验特性。ROADMAP 早期版本将其视为"等所有阻塞 issue 关闭后整体回迁"的潜在升级路径。基于 2026-05 对官方文档（docs.anthropic.com/agent-teams Limitations 章节）和 GitHub issues（#23620、#29163、#29271、#24108、#47021、#50622）的复检，ROADMAP 已修订为 Tier 0 / 1 / 2 / 3 分层 adoption 模型，详见 `ROADMAP.md` v3.0 章节。

本 ADR 把分层模型中的 **Tier 2 — 永不回迁** 决策固化为正式记录，关闭对 review / build / loop 三个流程是否切换到 Agent Teams 的反复讨论。

### 关键事实

1. **Forge 已迁移完成**：`/forge review`、`/forge decide`、`/forge build` 研究阶段在 2026-04-29 已从 Agent Teams 概念迁移到独立 Subagent 并行执行（`subagent-runner.ts`、`SubagentInvocation` / `SubagentResult` 类型协议），见 `.tinkerman/knowledge/sessions/2026-04-29-agent-team-migration.md`。
2. **Agent Teams 当前限制**（多数为架构性，不会修复）：
   - `/resume` 不恢复 in-process teammates（官方 Limitations）
   - Lead 固定，无法转移领导权（架构性）
   - Permissions 在 spawn 时锁定，无法 per-teammate（架构性）
   - Split-pane 仅 tmux/iTerm2，VS Code 集成终端、Windows Terminal、Ghostty 不支持
   - 每 teammate 独立 context，token 成本约为单 session 的 5x

### 流程级匹配度分析

| 流程 | 关键诉求 | Agent Teams 兼容性 |
|------|---------|---------------------|
| `/forge review` | fan-out → gather → merge；spec-check / quality-check / security-check 必须由同一逻辑去重；需要 `/forge resume` 可恢复 | 子任务无相互依赖 → 不需要 teammate 间通信；resume 失效 → 与 review 中断恢复直接冲突 |
| `/forge build` | 原子 commit + git transaction + Restatement Checkpoint + 三连击熔断 | Agent Teams shutdown 慢 + permissions 不可分粒度 → 与冻结区写入控制冲突；commit 协调跨 teammate 困难 |
| `/forge loop` | 跨迭代会话恢复、指数退避、循环熔断器、completion summary | resume 不恢复 teammates 是核心 blocker，loop 的存在意义就是跨会话执行 |

## Decision

`/forge review`、`/forge build`、`/forge loop` **永久使用独立 Subagent 并行执行模式**，不切换到 Agent Teams（in-process 或 split-pane 任一形态）。

具体含义：

1. **review** 保留三层独立 Subagent：spec-check / quality-check / security-check（轻量模式省略 spec-check）。Subagent 不可用时按 `forge-review` SKILL §2.5 fallback ladder 处理（L0→L1→L2→L3）。任何"用 Agent Teams 重写 review"的提案应该先引用本 ADR 并解释为什么 Tier 2 决策应该被推翻。
2. **build** 保留全量路径研究阶段的独立 Subagent 并行模式（`Promise.allSettled` + `agentType` 白名单 + 运行时类型守卫），不引入 teammate 间消息通信。
3. **loop** 保留 SdkDriver + Orchestrator + EffectExecutor 的纯函数状态机 + 副作用执行器架构，不接入 Agent Teams 的 lead/teammate 拓扑。

**Tier 1 例外不受本 ADR 影响**：`/forge decide --mode=teams` 作为 opt-in PoC（详见 `skills/forge/lib/decide-teams/instructions.md`）继续保留，用于评估 architecture / research / debug-with-competing-hypotheses 类型的高 token / 高质量决策场景，**不影响**主线 `/forge decide` 的 Subagent 实现。

## Consequences

### Positive

- 关闭一个反复讨论方向，节省决策成本
- review / build / loop 的工程纪律（commit 原子性、resume 可恢复、Subagent 容错）得以稳定演进，不被 Agent Teams 的官方限制反复牵扯
- 与 Forge 三区权限模型（frozen / guarded / open）保持一致——permissions 必须在调用点决策，不能 spawn 时锁定
- 与 Forge 测试纪律保持一致——Subagent 模式可以被属性测试覆盖到（`subagent-runner.property.test.ts`），Agent Teams 的 in-process 拓扑不可直接测试

### Negative

- 放弃了 teammate 间直接通信带来的潜在收益（例如 review 三层之间的反向质询）。但实际上这种通信在 Forge 的设计里是反模式——独立性是 review 信号可信度的来源
- 用户在主流程外想用 Agent Teams 时，hook 集成（Tier 0）可以兜底，但不会获得与 Subagent 模式同等的工程保证（resume / 熔断 / commit 原子性）
- 未来如果 Anthropic 把 resume / lead-transfer / per-teammate permissions 全部修复，本 ADR 的判定基础有部分失效。但**架构性限制**（split-pane 平台、token 5x）短期内不会变，Tier 2 的核心论据仍然成立。届时通过 superseded ADR 重新评估

### Reassessment Triggers

仅当以下条件**同时**满足时，本 ADR 应被 superseded：

1. `/resume` 官方支持恢复 in-process teammates（不再标 known limitation）
2. Per-teammate permissions 可在 spawn 时设置
3. token 成本下降到单 session 的 1.5x 以内
4. Forge 的某个真实使用场景（非 PoC）证明 Subagent 模式存在 review / build / loop 已无法解决的痛点
