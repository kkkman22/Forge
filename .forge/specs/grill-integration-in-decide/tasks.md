---
feature: grill-integration-in-decide
layout: tasks
created: 2026-06-03
spec_ref: ".forge/specs/grill-integration-in-decide/requirements.md"
---

# Tasks

## Task 1: decide/instructions.md 新增 Round 0

- [x] 1.1 在 `skills/forge/lib/decide/instructions.md` §2 的 "### Round 1 — Perspective Subagents" 之前，插入 "### Round 0 — Proactive Grill (条件触发)" 段落。内容包括：4 条触发条件、4 条不触发条件、触发后行为（inline grill 3-5 核心问题、findings 注入 Round 1）、用户控制提示（"跳过？[y/N]"）、约束（30 秒/问题、≤5 分钟总时长）。
- [x] 1.2 在 Round 0 段落末尾添加"与 §2.7 No Confirmation Between Steps 的关系"说明（Round 0 的 "跳过？" 是唯一用户交互点，后续问题连续执行）。

## Task 2: product.md 追加推荐答案和 code-first 行为

- [x] 2.1 在 `.claude/agents/product.md` 的 `## Behavioral Rules` 列表中，在现有规则 5 之后追加规则 6：推荐答案行为。内容包括：输出格式（Q + 💡 推荐 + 确认提示）、推荐答案 4 条原则（具体/中立/短/太宽则拆分）。
- [x] 2.2 追加规则 7：code-first resolution。内容包括：4 种场景的 routing（现在的行为 → explore / 新行为 → 问用户 / 术语 → glossary / 文件 → explore）、explore 回答后标注 `[code-resolved]`。

## Task 3: 增强 Round 2a 触发条件

- [x] 3.1 在 `skills/forge/lib/decide/instructions.md` §2 的 Round 2a 段落中，将现有触发条件（"If Critic flags `disagreement_kind: "requirement_side"`"）扩展为 3 条触发条件：保留现有 requirement_side、新增术语使用不一致（≥2 视角对同一概念用不同术语）、新增核心结论直接矛盾。标注"增强后的触发条件（满足任一即触发）"。

## Task 4: 交叉验证

- [x] 4.1 验证 Round 0 的 inline grill 调用不与 `grill/instructions.md` 的 inline mode 规范冲突。验证 product agent 的推荐答案不与 "不给答案，只提问" 的规则 2 冲突（推荐答案是附带的，用户可以选择不同意）。验证 Round 2a 新增触发条件不与 Critic 的 `needs_revision` 机制冲突（inline grill 解决需求侧分歧，critic 解决技术侧分歧）。
