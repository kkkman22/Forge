---
topic: glossary-consistency-hook
generated_at: 2026-05-14
auto_generated: false
stage_count: 1
total_files: 1
---

# Feature: Glossary 一致性 Hook

## 阶段索引

| 阶段 | 文件 | 状态 | 最近更新 |
|------|------|------|---------|
| Decide | — | — | — |
| Spec | [spec.md](../specs/glossary-consistency-hook/spec.md) | draft | 2026-05-14 |
| Plan | — | — | — |
| Build | — | — | — |
| Review | — | — | — |
| Findings | — | — | — |
| Debug | — | — | — |

## 摘要

- **Spec** (draft, 2026-05-14)：将散落在 decide/grill/spec 中的 glossary 冲突检测收口到 `src/glossary-hook.ts`，提供统一入口 `runGlossaryCheck(phase, ...)` 和统一 prompt 模板。新增 plan/review/learn/build 四个 skill 的自动接入点。`src/glossary.ts` 核心纯函数零修改。
