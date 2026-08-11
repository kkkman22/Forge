---
feature: build-discipline-enhancement
layout: tasks
created: 2026-05-01
spec_ref: ".tinkerman/specs/build-discipline-enhancement/requirements.md"
---

# Tasks

## Task 1: Add Simplicity Check to forge-build

- [x] 1.1 Add §4.1 "Simplicity Check" subsection after §4 TDD Iron Rules in `skills/forge-build/SKILL.md`
- [x] 1.2 Include 3 concrete before/after examples (EventBus vs function call, factory vs components, form builder vs form components)
- [x] 1.3 State the "Rule of Three" — abstractions only in REFACTOR stage after 3+ repetitions

## Task 2: Add Change Summary to forge-build

- [x] 2.1 Add §6.6 "Change Summary" subsection in Execution Discipline section of `skills/forge-build/SKILL.md`
- [x] 2.2 Define three-part format: 变更 / 未触碰（有意）/ 关注点
- [x] 2.3 Add Change Summary to the Structured_Output exemption list in §6.5 (and CLAUDE.md §2.6 if needed)

## Task 3: Add Source-Driven Development rule to forge-build

- [x] 3.1 Add item (10) "Framework API 验证" to §3.2 Subagent Instruction Construction list in `skills/forge-build/SKILL.md`
- [x] 3.2 Specify when verification is needed (non-trivial APIs, version uncertainty) and when it can be skipped (pure logic, standard library)

## Task 4: Add Chesterton's Fence trigger to forge-build

- [x] 4.1 Add new row to Reflection Triggers table in `skills/forge-build/SKILL.md` for "删除或大幅修改现有代码"
- [x] 4.2 Define trigger question, interactive handling, and autonomous handling

## Task 5: Add Dependency Discipline to forge-build

- [x] 5.1 Add §6.7 "Dependency Discipline" subsection in Execution Discipline section of `skills/forge-build/SKILL.md`
- [x] 5.2 Define 4-item confirmation checklist (existing stack, size, maintenance, license)

## Task 6: Add Dead Code Hygiene to forge-build REFACTOR step

- [x] 6.1 Add dead code scan step to §4 TDD REFACTOR phase description in `skills/forge-build/SKILL.md`
- [x] 6.2 Define scan targets (unused imports, functions, types, variables)
- [x] 6.3 Specify that findings are recorded to `.tinkerman/findings/`, not auto-deleted

## Task 7: Verify consistency

- [x] 7.1 Verify no duplication with existing §6.0 Anti-drift Execution Guardrails
- [x] 7.2 Verify no duplication with Known AI Failure Patterns table
- [x] 7.3 Run `npm run check` to confirm all tests pass
