---
topic: branch-topic-gate-hook
generated_at: 2026-05-14
auto_generated: false
stage_count: 1
total_files: 1
---

# Feature: Branch Topic Gate Hook

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/branch-topic-gate-hook/spec.md) | draft | 2026-05-14 |
| Plan | — | — | — |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (draft, 2026-05-14)：将 `src/branch-lifecycle.ts` 的 5 个纯函数包装为统一 hook `runBranchGate(phase, ...)`，普及到 plan/review/test/debug/learn 等 5 个 skill 启动处。autonomous 模式自动 checkout（dirty tree 除外），interactive 模式中文 3 选项。不新增纯函数，仅做调度普及。
