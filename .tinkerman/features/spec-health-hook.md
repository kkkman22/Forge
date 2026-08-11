---
topic: spec-health-hook
generated_at: 2026-05-14
auto_generated: false
stage_count: 1
total_files: 1
---

# Feature: Spec-health Hook

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/spec-health-hook/spec.md) | locked | 2026-05-15 |
| Plan | [plan.md](../plans/spec-health-hook.md) | approved | 2026-05-15 |
| Build | 9 commits, 33 tests | completed | 2026-05-15 |
| Review | 3-layer, P1 fixed | completed | 2026-05-15 |
| Findings | P2/P3 advisory only | completed | 2026-05-15 |
| Debug | — | — | — |

## 摘要

- **Spec** (draft, 2026-05-14)：将 spec-leak / scenario-lint / glossary-miss 三维度检测整合为 `src/spec-health.ts` 的 `checkSpecHealth(input)` 纯函数，明确量化 ambiguity_score（[0, 1]），输出 SpecHealthReport。Plan/build/debug/review 启动时自动评估，verdict=degraded 时阻塞或 advisory。为 grill-auto-trigger-and-inline 提供精确触发信号来源。
