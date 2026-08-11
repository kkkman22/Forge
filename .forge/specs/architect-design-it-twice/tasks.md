---
feature: architect-design-it-twice
layout: tasks
created: 2026-06-03
spec_ref: ".forge/specs/architect-design-it-twice/requirements.md"
---

# Tasks

## Task 1: architect.md 追加 Design It Twice + 架构术语

- [x] 1.1 在 `.claude/agents/architect.md` 的 `## Evaluation Dimensions` 之后、`## Behavioral Rules` 之前，插入 `## Design It Twice（条件触发）` 段落。内容包括：触发条件判断表（4 条触发 vs 4 条不触发）、3 方案设计说明（Minimal/Flexible/Common-Case）、每个方案的 4 项内容要求（interface/示例/隐藏内容/trade-offs）、综合比较维度（Depth/Locality/Seam Placement）、强推荐原则。
- [x] 1.2 在 Design It Twice 之后插入 `## 架构术语` 段落。包含术语表（Module/Interface/Depth/Seam/Adapter/Leverage/Locality）和 Deletion Test 说明。

## Task 2: 更新 architect.md Output Format

- [x] 2.1 在 `## Output Format` 中，在现有 `### Technical Solution` 模板之后追加条件分支模板 `### Technical Solution — Design It Twice`。包含：问题空间、方案 A/B/C、对比、推荐。标注"Design It Twice 触发时使用此模板，tokens 限制提升至 800"。

## Task 3: forge-decide-arch.md 同步追加

- [x] 3.1 在 `.claude/agents/forge-decide-arch.md` 中同步追加 Design It Twice 段落和架构术语段落。内容与 architect.md 一致。在 `## 分析方法` 第 4 步后追加"第 5 步：如涉及 interface 设计，执行 Design It Twice 流程"。

## Task 4: 交叉验证

- [x] 4.1 验证 architect.md 的 Design It Twice 输出不与 decide/instructions.md 的 Round 1 500 tokens 限制冲突（Design It Twice 允许 800 tokens，需在 decide/instructions.md §6 Token Control 中标注 architect 视角 Design It Twice 时的例外）。验证 forge-decide-arch.md 的 disallowedTools 包含 Agent 但不阻止 inline 多方案输出。验证架构术语不与 `.forge/glossary.md` 现有术语冲突。
