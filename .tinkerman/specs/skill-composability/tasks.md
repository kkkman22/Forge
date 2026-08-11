---
feature: skill-composability
layout: tasks
created: 2026-05-01
spec_ref: ".tinkerman/specs/skill-composability/requirements.md"
---

# Tasks

## Task 1: Extract forge-build references

- [x] 1.1 Create `skills/forge-build/references/tdd-rules.md` — extract §4 TDD Iron Rules detailed content + §4.1 Simplicity Check
- [x] 1.2 Create `skills/forge-build/references/closure-probes.md` — extract §3.4 Closure-First Probes full content
- [x] 1.3 Create `skills/forge-build/references/context-budget.md` — extract Context Budget Management full content (Hard Token Limits table, Lifecycle Classification, Trimming Execution Timing)
- [x] 1.4 Create `skills/forge-build/references/anti-drift.md` — extract §6.0 Anti-drift Execution Guardrails + Reflection Triggers table
- [x] 1.5 Create `skills/forge-build/references/change-summary.md` — extract §6.6 Change Summary format
- [x] 1.6 Create `skills/forge-build/references/dependency-discipline.md` — extract §6.7 Dependency Discipline
- [x] 1.7 Create `skills/forge-build/references/function-contracts.md` — extract all "Function Call" blocks from forge-build SKILL.md

## Task 2: Slim down forge-build SKILL.md main body

- [x] 2.1 Replace extracted sections with `→ 详见 references/<filename>` pointers
- [x] 2.2 Keep summaries of each section (1-3 lines) in the main body
- [x] 2.3 Verify main body is ≤200 lines
- [x] 2.4 Verify all existing content is preserved in either main body or references (no content loss)

## Task 3: Extract forge-review references

- [x] 3.1 Create `skills/forge-review/references/confidence-filtering.md` — extract §6 Confidence Filtering full content
- [x] 3.2 Create `skills/forge-review/references/dedup-pipeline.md` — extract §7.1 Finding Deduplication + §7.2 Cross-Reviewer Consistency
- [x] 3.3 Create `skills/forge-review/references/quality-gate.md` — extract §7.3 Report Quality Gate
- [x] 3.4 Create `skills/forge-review/references/function-contracts.md` — extract all "Function Call" blocks

## Task 4: Slim down forge-review SKILL.md main body

- [x] 4.1 Replace extracted sections with pointers
- [x] 4.2 Verify main body is ≤150 lines
- [x] 4.3 Verify no content loss

## Task 5: Extract forge-plan references

- [x] 5.1 Create `skills/forge-plan/references/atomic-task-format.md` — extract §3 Atomic Task Format with TDD step examples
- [x] 5.2 Create `skills/forge-plan/references/lightweight-task-format.md` — extract lightweight task format from §2 Step 3
- [x] 5.3 Create `skills/forge-plan/references/prohibited-content.md` — extract §4 Prohibited Content List
- [x] 5.4 Create `skills/forge-plan/references/function-contracts.md` — extract all "Function Call" blocks

## Task 6: Slim down forge-plan SKILL.md main body

- [x] 6.1 Replace extracted sections with pointers
- [x] 6.2 Verify main body is ≤150 lines
- [x] 6.3 Verify no content loss

## Task 7: Add cross-SKILL references

- [x] 7.1 Update `skills/forge-debug/SKILL.md` Phase 4 to reference `../forge-build/references/tdd-rules.md`
- [x] 7.2 Update `skills/forge-test/SKILL.md` to reference `../forge-build/references/tdd-rules.md` for TDD verification
- [x] 7.3 Verify cross-SKILL reference paths are correct

## Task 8: Add Persona override declarations

- [x] 8.1 Add persona override note to `skills/forge-review/SKILL.md` §2
- [x] 8.2 Add persona override note to `skills/forge-decide/SKILL.md` §2

## Task 9: Update contract tests and verify

- [x] 9.1 Update contract.test.ts to verify references/ files exist for forge-build, forge-review, forge-plan
- [x] 9.2 Add contract test to verify `→ 详见 references/` pointers point to existing files
- [x] 9.3 Run `npm run check` to confirm all tests pass
- [x] 9.4 Manually verify main body line counts: forge-build ≤200, forge-review ≤150, forge-plan ≤150
