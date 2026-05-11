---
topic: agent-team-migration
generated_at: 2026-05-11T13:25:17.577Z
auto_generated: true
stage_count: 4
total_files: 4
---

# Feature: agent-team-migration

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/agent-team-migration/spec.md) | locked | 2026-04-29 |
| Plan | [agent-team-migration.md](../plans/agent-team-migration.md) | approved | 2026-04-29 |
| Build | [agent-team-migration.md](../progress/agent-team-migration.md) | done | 2026-04-29 |
| Review | [agent-team-migration.md](../reviews/agent-team-migration.md) | (no status) | 2026-04-29 |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (locked, 2026-04-29)：### R1: Review 评审迁移 - Review Engine 使用独立 Subagent（spec-check、quality-check、security-check）并行执行替代 Agent Team - 轻量模式仅启动 quality-check 和 security-chec...
- **Plan** (approved, 2026-04-29)：将 Forge 的三个 Agent Teams 场景（review、decide、build 研究）迁移到独立 Subagent 并行执行模式，消除 Team 生命周期管理带来的可靠性问题。
- **Build** (done, 2026-04-29)
- **Review** (unknown, 2026-04-29)：Agent Team → Subagent migration reviewed across three layers. Initial P1 issues (3) fixed and verified:  1. ✅ `test/subagent-runner.property.test.t...
