---
topic: knowledge-hooks-auto-rebuild
generated_at: 2026-05-14
auto_generated: false
stage_count: 1
total_files: 1
---

# Feature: Knowledge Integrity / Catalog 自动 Hook

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/knowledge-hooks-auto-rebuild/spec.md) | draft | 2026-05-14 |
| Plan | — | — | — |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (draft, 2026-05-14)：将 `knowledge-integrity.ts` 和 `knowledge-catalog.ts` 作为事件驱动的自动 hook，在 ADR 写入 / solutions 文件变更 / episode 累积达阈值时自动触发，确保 catalog 始终新鲜。Event-driven 不是 time-based；autonomous 模式 fire-and-forget。底层库接口零修改。
