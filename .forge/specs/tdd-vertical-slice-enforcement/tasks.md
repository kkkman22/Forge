---
feature: tdd-vertical-slice-enforcement
layout: tasks
created: 2026-06-03
spec_ref: ".forge/specs/tdd-vertical-slice-enforcement/requirements.md"
---

# Tasks

## Task 1: CLAUDE.md 追加 §2.1.1 Vertical Slice Only

- [ ] 1.1 在 `CLAUDE.md` §2.1 的 `<IRON-LAW name="tdd-delete-and-restart">` 段落之后、`→ 详见 docs/forge-constitution-detail.md §2.1` 引用之前，插入 §2.1.1 Vertical Slice Only 铁律。内容包括：原则声明、WRONG/RIGHT 对比示例、"为什么"解释（批量测试验证想象中的行为，垂直切片让每个测试响应实际实现）。

## Task 2: tdd-rules.md 追加 §5 和 §6

- [ ] 2.1 在 `skills/forge/lib/build/references/tdd-rules.md` 的 Rationalization Catalog 之后追加 §5 "Anti-Pattern: Horizontal Slicing"。内容包括：定义、为什么是垃圾（4 点）、正确做法、检测信号（3 条 self-check 规则）。
- [ ] 2.2 在 §5 之后追加 §6 "Good vs Bad Tests"。内容包括：Good Tests 5 条特征 + TypeScript 示例、Bad Tests 6 条特征 + 3 个 TypeScript 对比示例（BAD/BAD/GOOD）、判断规则表（4 条信号）。

## Task 3: atomic-task-format.md 追加 Vertical Slice Constraint

- [ ] 3.1 在 `skills/forge/lib/plan/references/atomic-task-format.md` 的 `## TDD Step Format` 标题之后、"Each task's TDD steps must include three phases:" 之前，插入 Vertical Slice Constraint 声明（一个 Task = 一个 Tracer Bullet，禁止包含多条独立测试-实现对）。

## Task 4: 交叉验证

- [ ] 4.1 验证 CLAUDE.md §2.1.1 引用了 `.forge/glossary.md` 的 `Vertical Slice` 定义。验证 `tdd-rules.md` §5/§6 的示例代码语法正确。验证 `atomic-task-format.md` 的 Constraint 不与现有 Expected 字段规则冲突。
