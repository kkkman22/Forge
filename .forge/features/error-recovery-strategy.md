---
topic: error-recovery-strategy
generated_at: 2026-05-11T13:25:17.584Z
auto_generated: true
stage_count: 2
total_files: 2
---

# Feature: error-recovery-strategy

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/error-recovery-strategy/spec.md) | locked | 2026-04-29 |
| Plan | [error-recovery-strategy.md](../plans/error-recovery-strategy.md) | approved | 2026-04-29 |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (locked, 2026-04-29)：为 `/forge resume` 实现系统性错误恢复机制，通过 git log 扫描、未提交变更检测、状态交叉比对和中断点精确分类，实现会话中断后的自动状态恢复。
- **Plan** (approved, 2026-04-29)：为 `/forge resume` 实现系统性错误恢复机制。纯 TypeScript 模块，所有核心逻辑为纯函数，不执行 I/O。
