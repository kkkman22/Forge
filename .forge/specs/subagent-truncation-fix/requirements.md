---
status: completed
feature: subagent-truncation-fix
layout: requirements
created: 2026-05-29
tier: standard
---
# Subagent 结果截断修复

## 背景

Forge 的 review 子 agent（spec-check、quality-check、security-check）在高工具调用场景下出现结果截断：
- 当 subagent 的 `tool_uses ≥ 5` 时，返回的最终消息被截断
- 导致 Layer 报告（spec-check / quality-check / security-check 的结论）丢失
- `/forge review` 因此可能输出不完整的评审结果

该问题横跨两个已有 spec（`subagent-foreground-truncation`、`subagent-result-truncation`），需要统一修复。

## 现状分析

### 已有缓解措施
- `subagent-hook-context-budget` 已实现 hook 注入上限（4096 bytes），减少上下文膨胀
- `spec-check` 的 plans 枚举问题已通过精确路径 Read 修复
- `subagent-foreground-truncation` 的部分修复已合并

### 未解决根因
1. **quality-check 和 security-check** 仍有截断（6+ tool_uses）
2. **结构性报告生成无保证**——Layer 报告可能因 token 限制被截断
3. **maxTurns 配置**未针对 review subagent 优化

## 需求

### 1. Subagent 结果完整性保证

**核心需求**：无论 subagent 执行多少工具调用，最终必须输出完整的 Layer 报告。

- 1.1 Review subagent 的 SKILL 文档必须定义**结构化报告模板**，报告作为独立段落置于最末
- 1.2 报告模板采用定长格式（非散文），降低截断风险
- 1.3 如果 subagent 的 token 预算不足以生成完整报告，应提前中断工具调用循环并输出已收集信息的报告

### 2. Token 预算管理

- 2.1 每个 review subagent 在 SKILL 文档中声明预估 token 消耗
- 2.2 根据 `maxTurns` 和预估消耗，自动计算何时停止工具调用并开始生成报告
- 2.3 报告生成阶段不再调用任何工具（纯文本输出）

### 3. 截断检测与降级

- 3.1 主 agent（`/forge review`）在收到 subagent 结果后，检测是否包含完整的 Layer 报告段落
- 3.2 如果 Layer 报告缺失或明显不完整，标记该 Layer 为 `truncated`
- 3.3 `truncated` 层的评审结果不阻断 ship，但在报告中明确标注"数据不完整"
- 3.4 如果全部三层均 truncated，触发串行重试（concurrency=1，独立于执行失败 Fallback Ladder）

### 4. Agent 定义优化

- 4.1 `spec-check.md`、`quality-check.md`、`security-check.md` 的 SKILL 文档中增加 `maxTurns` 建议
- 4.2 根据 spec 复杂度，spec-check 的 maxTurns 可高于 quality-check 和 security-check
- 4.3 文档中明确"先收集、后报告"的两阶段执行模式

## 验收标准

- [ ] 三个 review subagent 的 SKILL 文档包含结构化报告模板
- [ ] 报告模板为定长格式，可被正则/结构化解析
- [ ] 主 agent 检测 subagent 结果完整性，标记 `truncated`
- [ ] 全部 truncated 时触发串行重试
- [ ] `maxTurns` 配置写入 agent 定义或 SKILL 文档
- [ ] E2E 测试：模拟高 tool_uses 场景，验证报告完整性
- [ ] 单元测试：截断检测逻辑

## 依赖

- `subagent-hook-context-budget`（已完成）
- `review-no-mainagent-fallback`（Fallback Ladder 定义）
- Agent SDK 的 maxTurns 支持

## 非目标

- 不修改 Agent SDK 本身
- 不解决非 review subagent 的截断问题（聚焦 review 场景）
