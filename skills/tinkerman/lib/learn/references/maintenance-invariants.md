---
updated: 2026-08-11
---
# Knowledge Base Maintenance — 详细规范

> 从 `../instructions.md §7` 拆分。SKILL 主文件只保留一行摘要指针。

## Document Count Limit

`solutions/` 上限 20 个（`config.md` 中 `knowledge_limit` 可配置）。超限时按 confidence 从低到高删除。

## Low Confidence Auto-cleanup

`instincts.md` 中 Confidence_Score < 0.3 的模式自动删除。每次 learn 执行时先维护。

## High Overlap Document Merge

写入前检测 tags 重叠度（共同 tags / min(tags 数)）。≥ 50% 时合并到已有文档：

- 更新 date
- 提升 confidence（+0.1，上限 0.9）
- 合并 tags

## Maintenance Invariants

维护完成后必须满足：

1. 文档数 ≤ 上限
2. 无低置信度模式（Confidence_Score < 0.3）

## Function Call

**`maintainKnowledgeBase(state)`**
- 参数：`state` — 当前知识库状态（`KnowledgeBaseState` 类型，含 `documents` 数组、`instinctPatterns` 数组、`limit` 数量上限）
- 返回：`MaintenanceResult`（含保留/移除的文档和模式列表，及维护后的不变量校验结果）
- 用途：执行文档上限和置信度下限不变量检查，超限文档按 confidence 从低到高清理，低置信度模式（< 0.3）自动删除

## High-Frequency Patterns and instincts.md

### High-Frequency Pattern Recognition

同一模式在 2+ 知识文档中出现且 confidence ≥ 0.5 时，提升为"直觉"。

### instincts.md Format

每个模式包含：标题、Confidence_Score（0.3-0.9）、Tags、来源、描述。

### Cross-project Pattern Promotion

模式 confidence ≥ 0.8、不依赖特定技术栈、描述通用工程实践时，建议用户提升到 `patterns/`。

### Confidence_Score Range

instincts.md 中每个模式必须在 **0.3 至 0.9** 范围内。
