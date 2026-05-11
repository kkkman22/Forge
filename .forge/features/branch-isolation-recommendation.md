---
topic: branch-isolation-recommendation
generated_at: 2026-05-11T13:25:17.578Z
auto_generated: true
stage_count: 3
total_files: 3
---

# Feature: branch-isolation-recommendation

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/branch-isolation-recommendation/spec.md) | locked | 2026-05-10 |
| Plan | [branch-isolation-recommendation.md](../plans/branch-isolation-recommendation.md) | approved | 2026-05-10 |
| Build | — | — | — |
| Review | [branch-isolation-recommendation.md](../reviews/branch-isolation-recommendation.md) | (no status) | 2026-05-10 |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (locked, 2026-05-10)：为 `/forge build` 的 Branch Gate 增加智能推荐逻辑：根据工作树状态、已有 worktree 数量、任务档位，向开发者推荐使用 feature 分支或 worktree 隔离开发。解决当前 Branch Gate 在脏工作树时只能阻断、无法引导用户选择合适隔离方式的问题。
- **Plan** (approved, 2026-05-10)：为 Branch Gate 增加隔离方式推荐逻辑。当分支不匹配时，基于工作树状态、活跃 worktree 数量、任务档位推荐 feature 分支或 worktree，通过 AskUserQuestion 让开发者选择。纯函数 + SKILL 层集成，不改现有函数签名。
- **Review** (unknown, 2026-05-10)：All 8 scenarios (S1-S8) verified against implementation. No scope creep.
