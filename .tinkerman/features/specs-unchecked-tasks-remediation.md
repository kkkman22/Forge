---
topic: specs-unchecked-tasks-remediation
generated_at: 2026-05-11T13:25:17.598Z
auto_generated: true
stage_count: 6
total_files: 6
---

# Feature: specs-unchecked-tasks-remediation

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | [2026-05-09-specs-unchecked-tasks-remediation.md](../decisions/2026-05-09-specs-unchecked-tasks-remediation.md) | confirmed | 2026-05-09 |
| Spec | [spec.md](../specs/specs-unchecked-tasks-remediation/spec.md) | locked | 2026-05-09 |
| Plan | [specs-unchecked-tasks-remediation.md](../plans/specs-unchecked-tasks-remediation.md) | approved | 2026-05-09 |
| Build | [specs-unchecked-tasks-remediation.md](../progress/specs-unchecked-tasks-remediation.md) | (no status) | 2026-05-09 |
| Review | [specs-unchecked-tasks-remediation.md](../reviews/specs-unchecked-tasks-remediation.md) | (no status) | 2026-05-09 |
| Findings | [specs-unchecked-tasks-remediation.md](../findings/specs-unchecked-tasks-remediation.md) | (no status) | 2026-05-09 |
| Debug | — | — | — |

## 摘要

- **Decide** (confirmed, 2026-05-09)：**Problem**: 4 specs have 15+ deviations with wildly varying user value — real feature gaps (Layer 4 review integration, acceptance gate) mixed wit...
- **Spec** (locked, 2026-05-09)：补齐 `.kiro/specs/` 下 4 个 spec 的未完成任务，消除已注册命令/能力与实际代码之间的差距。为 Forge 框架开发者提供完整的 review 四层流水线和 ship 验收门禁。
- **Plan** (approved, 2026-05-09)：实现锁定 Spec 中的 10 个需求，补齐 4 个 spec 的未完成任务：Review Layer 4 前端检查集成、Ship 验收门禁对接、Agent 背景执行配置、Findings 保留策略、validate-skill-descriptions 默认严格、PR 模板补充、evolve...
- **Build** (unknown, 2026-05-09)：- [x] Task 1: evolved-rules R3 Source 引用修复 - [x] Task 2: Agent frontmatter background: true - [x] Task 3: Config 开放区 + frontmatter 字段 - [x] Task 4:...
- **Review** (unknown, 2026-05-09)：\| Layer \| Status \| P0 \| P1 \| P2 \| P3 \| \|-------\|--------\|----\|----\|----\|----\| \| Spec Alignment \| done \| 0 \| 0 \| 0 \| 0 \| \| Code Quality \| done \| 0 \|...
- **Findings** (unknown, 2026-05-09)：- [Spec 1 — phase-advance-hardening](#spec-1--phase-advance-hardening1-处偏差) - [Spec 2 — oz-skills-inspiration](#spec-2--oz-skills-inspiration4-处偏差)...
