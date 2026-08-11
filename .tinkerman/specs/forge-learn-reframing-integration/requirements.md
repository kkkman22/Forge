---
status: completed
feature: forge-learn-reframing-integration
layout: requirements
created: 2026-06-04
tier: light
---
# Requirements Document — `/forge learn` Reframing 日志集成

## 引言

`/forge decide` 和 `/forge spec` 现在在执行前会运行 Reframing Gate / Clarification Gate，将交互数据记录到 `.tinkerman/progress/<slug>-reframing.jsonl` 和 `*-clarification.jsonl`。但 `/forge learn` 目前不读取这些日志，导致 Gate 的效果数据（哪些问题改变了结果、哪些被跳过）无法沉淀为项目经验。

本 spec 让 learn skill 读取 Gate 日志，提炼高价值问题模式，并可选地提升为 evolved-rule。

## 术语表

- **Gate_Log**: Reframing Gate 或 Clarification Gate 产生的 JSONL 反馈日志
- **Outcome_Changed**: 日志字段，标记用户回答是否导致了与"跳过时"不同的结果
- **Question_Pattern**: 从 Gate 日志中提炼的可复用提问模式（如"约束揭示"类问题在 70% 场景下改变了结果）

## Requirements

### Requirement 1: learn 读取 Gate 日志

**User Story:** As a Forge maintainer running `/forge learn`, I want the learn skill to automatically analyze gate feedback logs so that high-value question patterns are identified and potentially promoted.

#### 验收标准

1. WHEN `/forge learn` 被调用，THE learn skill SHALL 扫描 `.tinkerman/progress/` 下所有 `*-reframing.jsonl` 和 `*-clarification.jsonl` 文件。
2. THE learn skill SHALL 聚合每个问题维度的统计数据：`questions_asked` 总数、`questions_answered` 总数、`questions_skipped` 总数、`outcome_changed=true` 比例。
3. WHEN 某个问题维度的 `outcome_changed=true` 比例 > 50% 且样本数 ≥ 3，THE learn skill SHALL 输出一条建议："问题维度 '{dimension}' 在 {N} 次使用中 {P}% 改变了结果。建议提升为 evolved-rule。"
4. THE learn skill SHALL 将 Gate 日志的统计摘要写入 `.tinkerman/knowledge/sessions/<date>-gate-stats.md`。

### Requirement 2: evolved-rule 提升

**User Story:** As a Forge maintainer, I want high-value question patterns to be automatically proposed as evolved-rules so that future decide/spec sessions benefit from validated question strategies.

#### 验收标准

1. WHEN learn 输出 evolved-rule 建议，THE 系统 SHALL 按照 §5.2 Self-Evolution Protocol 的 Propose → Declare → Approve → Log 流程处理。
2. THE proposed evolved-rule SHALL 格式为：`gate-dimension-{dimension}-high-impact`，内容为该维度的触发条件和推荐问题。
3. WHEN 用户拒绝 evolved-rule 建议，THE learn skill SHALL 记录拒绝原因到 session 日志。
