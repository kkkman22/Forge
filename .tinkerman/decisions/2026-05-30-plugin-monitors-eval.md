---
id: "eval-002"
title: "Plugin Monitors 持续监控评估（§39）"
status: proposed
date: "2026-05-30"
deciders:
  - "@maintainer"
related_adrs:
  - "2026-05-28-claude-code-uplift-2.1.153.md"
---

> §39 源自 Claude Code CHANGELOG 优化建议收集（spec: misc-forge-optimization）。

# Plugin Monitors 持续监控评估（§39）

## Context

Claude Code plugin 的 `monitors` 功能允许定义持续运行的后台监控进程。Forge 当前使用 Stop hook 实现类似功能：

1. **evolved-rules stale 检测**：Stop hook 检查 `.tinkerman/knowledge/evolved-rules.md` 中的 PENDING 状态
2. **任务完成提醒**：Stop hook 检查 `.tinkerman/progress/*.md` 中未完成任务
3. **persistent-loop.sh**：Stop hook 驱动 TDD 循环（已被 `/goal` 替代）

## 评估

### Monitors vs Stop Hook 对比

| 维度 | Stop Hook | Monitors（预期） |
|------|-----------|-----------------|
| 触发时机 | 会话结束时 | 持续后台运行 |
| 配置位置 | settings.json hooks | plugin manifest |
| 适合场景 | 一次性提醒、清理 | 持续健康检查、指标收集 |
| 上下文 | 可访问会话状态 | 独立进程，无会话上下文 |

### 分析

1. **evolved-rules stale 检测**：Stop hook 在会话结束时触发，时机合适。改为 monitor 需要独立轮询 `.tinkerman/knowledge/evolved-rules.md`，增加复杂度但无额外收益。当前方案足够。

2. **任务完成提醒**：Stop hook 在用户停止编码时提醒，时机精确。Monitor 持续运行会产生重复提醒噪声。

3. **persistent-loop.sh**：已被 `build.use_goal: true` 替代，不再需要。

4. **潜在新用途**：如果未来需要持续监控（如 `evolved-rules.md` 中规则超过 5 session 未审核自动降级、CI 健康度持续跟踪），monitors 比 Stop hook 更合适。但当前无此需求。

## Decision

**当前阶段不迁移到 monitors。** Stop hook 已满足现有需求。当以下条件之一满足时重新评估：

- 需要真正的持续监控（非会话结束触发）
- 需要后台定期清理（如过期 event log 自动清理）
- Claude Code monitors API 稳定且有文档

## Consequences

### Positive

- 不引入新的运行时依赖
- 保持 hooks.json 配置的简洁性

### Negative

- 如果需要持续监控能力，需要后续迁移
- Stop hook 依赖会话生命周期，无法在无会话时工作
