---
topic: conflict-resolver-hook
generated_at: 2026-05-14
auto_generated: false
stage_count: 1
total_files: 1
---

# Feature: fix-conflicts hook 化为跨阶段冲突处理能力

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/conflict-resolver-hook/spec.md) | locked | 2026-05-15 |
| Plan | — | — | — |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (draft, 2026-05-14)：将 forge-fix-conflicts 的核心三区分类逻辑抽离到 src/conflict-resolver.ts 纯函数库，由 ship / build / Forge Loop 等触发点自动调用，同时保留 /forge fix-conflicts 显式入口。frozen 区在 autonomous 模式下绝不静默处理。
