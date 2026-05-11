---
topic: ship-delivery-unification
generated_at: 2026-05-11T13:25:17.594Z
auto_generated: true
stage_count: 2
total_files: 2
---

# Feature: ship-delivery-unification

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/ship-delivery-unification/spec.md) | locked | 2026-04-29 |
| Plan | [ship-delivery-unification.md](../plans/ship-delivery-unification.md) | approved | 2026-04-29 |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (locked, 2026-04-29)：### R1: 交付级 Git 命令构建器 - `git-transaction.ts` 新增 `buildCheckoutCommand`、`buildMergeCommand`、`buildBranchDeleteCommand`、`buildPushCommand`、`buildMerg...
- **Plan** (approved, 2026-04-29)：1. 扩展 `git-transaction.ts` — 交付级命令构建器（含属性测试和单元测试） 2. 扩展 `OrchestratorEffect` 类型 — Ship 效果 + EffectExecutor 实现 3. Checkpoint — 底层模块完成 4. 扩展 `executi...
