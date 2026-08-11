---
feature: plan-vertical-slice-hitl-afk
layout: tasks
created: 2026-06-03
spec_ref: ".forge/specs/plan-vertical-slice-hitl-afk/requirements.md"
---

# Tasks

## Task 1: plan/instructions.md 追加 Vertical Slice 约束和 HITL/AFK 规则

- [ ] 1.1 在 `skills/forge/lib/plan/instructions.md` Step 3 Task Breakdown 的现有拆解规则（Granularity / Independence / Ordering / Completeness）之后、`### Step 3.5` 之前，插入 `#### Vertical Slice 约束` 段落。内容包括：原则声明、WRONG/RIGHT 对比示例、判断标准（3 条）、基础设施例外（`nature: infrastructure`）。
- [ ] 1.2 在 Vertical Slice 约束之后插入 `#### HITL/AFK 标记` 段落。内容包括：标记表（AFK/HITL 含义和 build 行为）、HITL 触发条件（4 条）、默认值声明（AFK）。

## Task 2: atomic-task-format.md 追加字段

- [ ] 2.1 在 `skills/forge/lib/plan/references/atomic-task-format.md` 的字段表中，在 `**Commit Message**` 行之后追加两行：`| **Interaction** | AFK or HITL | AFK |` 和 `| **Nature** | feature / infrastructure / bugfix | feature |`。
- [ ] 2.2 在 `## Complete Task Example with Expected` 示例中追加 `**Interaction**: AFK` 和 `**Nature**: feature` 字段。
- [ ] 2.3 在 TDD Step Format 开头追加 Vertical Slice Constraint 声明："每个 Task 就是一个 Tracer Bullet——它包含一条测试（RED）和让那条测试通过的最小实现（GREEN）。一个 Task 禁止包含多条独立的测试-实现对。如果需要多对，拆成多个 Task，每个一对。"

## Task 3: 交叉验证

- [ ] 3.1 验证 Vertical Slice 约束引用了 `.forge/glossary.md` 的 `Vertical Slice` 定义。验证 HITL/AFK 标记与 `skills/forge/lib/build/instructions.md` §6.0.1 No Mid-build Confirmation 不冲突（HITL 暂停是合法的例外，Mid-build Confirmation 禁止的是无理由的确认请求）。验证新字段不影响 plan/instructions.md Step 4 Self-Check 的验证逻辑。
