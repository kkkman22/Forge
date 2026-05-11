---
topic: state-resilience
generated_at: 2026-05-11T13:25:17.599Z
auto_generated: true
stage_count: 1
total_files: 1
---

# Feature: state-resilience

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | — | — | — |
| Plan | [state-resilience.md](../plans/state-resilience.md) | approved | 2026-05-01 |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Plan** (approved, 2026-05-01)：为 Forge 状态系统增加三层防御：宽容解析（缺失字段用默认值）、降级执行（前置文件缺失时保守处理）、状态自愈（从文件系统重建不一致状态）。
