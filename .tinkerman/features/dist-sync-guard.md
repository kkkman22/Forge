---
topic: dist-sync-guard
generated_at: 2026-05-11T13:25:17.584Z
auto_generated: true
stage_count: 2
total_files: 2
---

# Feature: dist-sync-guard

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | — | — | — |
| Plan | [dist-sync-guard.md](../plans/dist-sync-guard.md) | approved | 2026-05-10 |
| Build | [dist-sync-guard.md](../progress/dist-sync-guard.md) | (no status) | 2026-05-10 |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Plan** (approved, 2026-05-10)：为 Forge 增加 src/dist 同步守卫。CI 层硬门禁（`check-dist-sync.mjs`）检测三类 drift（missing dist / orphan dist / compilation mismatch），本地便利工具（`dist-resync.sh`）一键同步，文...
- **Build** (unknown, 2026-05-10)：`.tinkerman/plans/dist-sync-guard.md` (approved)
