---
topic: refactor-fix-into-build-mode
generated_at: 2026-05-14
auto_generated: false
stage_count: 1
total_files: 1
---

# Feature: refactor / fix 退化为 forge-build 的 nature mode

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/refactor-fix-into-build-mode/spec.md) | draft | 2026-05-14 |
| Plan | — | — | — |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (draft, 2026-05-14)：将 forge-refactor 和 forge-fix 两个独立 skill 退化为 forge-build 的内部分支模式（refactor mode / bugfix mode），由 router 自动判定的 work_nature 字段驱动。零用户感知，方法库条件加载，预检查作为 nature-specific 的入口闸门。fix-conflicts 不在本 spec 范围。
