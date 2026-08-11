---
topic: branch-lifecycle-enforcement
generated_at: 2026-05-11T13:25:17.579Z
auto_generated: true
stage_count: 2
total_files: 2
---

# Feature: branch-lifecycle-enforcement

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/branch-lifecycle-enforcement/spec.md) | locked | 2026-04-29 |
| Plan | [branch-lifecycle-enforcement.md](../plans/branch-lifecycle-enforcement.md) | approved | 2026-04-29 |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (locked, 2026-04-29)：Forge 的分支生命周期管理存在系统性缺陷：分支门禁仅做前缀匹配，缺少出口流程、topic 级校验和过期检测。引入四个纯函数模块修复。
- **Plan** (approved, 2026-04-29)：修复 Forge 分支生命周期管理的四个系统性缺陷：topic 失配放行、keep-branch 无追踪、过期分支未检测、跨 topic 提交无阻止。
