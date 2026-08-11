---
topic: parallel-status-tracking
generated_at: 2026-05-11T13:25:17.587Z
auto_generated: true
stage_count: 2
total_files: 2
---

# Feature: parallel-status-tracking

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/parallel-status-tracking/spec.md) | locked | 2026-04-30 |
| Plan | [parallel-status-tracking.md](../plans/parallel-status-tracking.md) | approved | 2026-04-30 |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (locked, 2026-04-30)：引入多文件状态追踪模式（`.tinkerman/status/<task-id>.md`），使每个并行任务拥有独立的状态文件，同时保持单任务场景下的完全向后兼容。两个新模块（status-resolver.ts、status-manager.ts）+ 现有模块适配。
- **Plan** (approved, 2026-04-30)：引入多文件状态追踪，使并行任务拥有独立状态文件。两个新模块 + 现有模块适配，保持单任务向后兼容。
