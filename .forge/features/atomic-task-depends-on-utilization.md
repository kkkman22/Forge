---
topic: atomic-task-depends-on-utilization
generated_at: 2026-05-14
auto_generated: false
stage_count: 1
total_files: 1
---

# Feature: AtomicTask dependsOn 字段利用与 plan 拆解逻辑增强

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/atomic-task-depends-on-utilization/spec.md) | draft | 2026-05-14 |
| Plan | — | — | — |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (draft, 2026-05-14)：AtomicTask 的 `dependsOn?: number[]` 字段已存在但未启用。本 spec 让 plan AI 在 Step 3 主动识别任务依赖、Step 4 调用 task-graph 库校验图有效性。build/review 轻消费图（顺序校验），不实施并行执行。解决 ROADMAP L-16。
