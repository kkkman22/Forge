---
topic: grill-auto-trigger-and-inline
generated_at: 2026-05-14
auto_generated: false
stage_count: 1
total_files: 1
---

# Feature: grill 下沉为内部模块 + 自动触发机制

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/grill-auto-trigger-and-inline/spec.md) | draft | 2026-05-14 |
| Plan | — | — | — |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (draft, 2026-05-14)：将 forge-grill 的核心纯函数作为内部能力库暴露给 spec/decide，由调用方在检测到需求歧义或视角分歧时自动 inline 触发 grill 子流程。保留显式入口、router 前置、关键词触发不变。autonomous 模式自动 skip 并写 advisory。与 zoom-out auto-trigger 通过协调层处理优先级。
