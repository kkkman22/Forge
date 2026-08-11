---
topic: failure-sink-trigger-expansion
generated_at: 2026-05-14
auto_generated: false
stage_count: 1
total_files: 1
---

# Feature: Failure-Sink 触发面扩张

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/failure-sink-trigger-expansion/spec.md) | draft | 2026-05-14 |
| Plan | — | — | — |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (draft, 2026-05-14)：在 `src/failure-sink.ts` 的 FailureTrigger union 上扩展 5 个新成员（debug_resolved / grill_abandoned / test_layer_failed / conflict_validation_failed / loop_circuit_broken），让 debug/grill/test/fix-conflicts/loop 五个 skill 的失败场景自动沉淀为 episode + Evolution marker。零接口变更。
