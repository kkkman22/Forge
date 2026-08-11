---
topic: zoom-out-auto-trigger
generated_at: 2026-05-14
auto_generated: false
stage_count: 1
total_files: 1
---

# Feature: zoom-out 自动触发机制

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/zoom-out-auto-trigger/spec.md) | draft | 2026-05-14 |
| Plan | — | — | — |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (draft, 2026-05-14)：将 `/forge zoom-out` 从纯被动升级为可自动触发的"视角重置"机制。debug 反复失败或 decide 多轮无定论时自动触发，输出注入后续阶段上下文，打破局部锁定。
