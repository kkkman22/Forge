---
feature: plan-document-streamlining
layout: tasks
created: 2026-04-29
spec_ref: ".tinkerman/specs/plan-document-streamlining/requirements.md"
---

# Tasks: Plan Document Streamlining

## Task 1: Add LightweightTask types and format detection to plan.ts

- [x] 1.1 Add `PlanFormat`, `LightweightTask`, `DesignReferenceEntry`, and `DesignReferenceValidation` type definitions to `src/plan.ts`
- [x] 1.2 Implement `detectPlanFormat(frontmatter: string): PlanFormat` using `extractStringField` from `frontmatter.ts`
- [x] 1.3 Write unit tests for `detectPlanFormat` covering "lightweight", "full", missing field, and edge cases

## Task 2: Implement heading anchor extraction

- [x] 2.1 Implement `extractHeadingAnchors(markdownContent: string): string[]` in `src/plan.ts`
- [x] 2.2 Write property test for Property 2 (heading anchor extraction preserves heading identity) in `test/plan.property.test.ts`
- [x] 2.3 Write unit tests for `extractHeadingAnchors` with edge cases (special characters, CJK text, empty content, headings with inline code)

## Task 3: Implement LightweightTask validation

- [x] 3.1 Implement `validateLightweightTask(task: LightweightTask): { valid: boolean; errors: string[] }` in `src/plan.ts`
- [x] 3.2 Implement `validateLightweightPlan(tasks: LightweightTask[]): boolean` in `src/plan.ts` (delegates to `validateLightweightTask` and `validateDependencies`)
- [x] 3.3 Write property test for Property 1 (valid tasks pass, invalid tasks fail) in `test/plan.property.test.ts`
- [x] 3.4 Write property test for Property 5 (valid plans pass, invalid plans fail) in `test/plan.property.test.ts`
- [x] 3.5 Write property test for Property 6 (placeholder scanning covers all text fields) in `test/plan.property.test.ts`

## Task 4: Implement Design Reference validation

- [x] 4.1 Implement `validateDesignReferences(references: string[], designContent: string): DesignReferenceValidation` in `src/plan.ts`
- [x] 4.2 Write property test for Property 3 (existing anchors pass, missing anchors fail) in `test/plan.property.test.ts`
- [x] 4.3 Write unit tests for `validateDesignReferences` with specific design.md content and edge cases

## Task 5: Implement unified plan validation dispatcher

- [x] 5.1 Implement `validatePlan(frontmatter, tasks, designContent?)` dispatcher in `src/plan.ts`
- [x] 5.2 Write property test for Property 4 (format detection defaults to "full") in `test/plan.property.test.ts`
- [x] 5.3 Write unit tests for `validatePlan` verifying correct routing for both formats
- [x] 5.4 Verify existing `validateAtomicTask` and `validatePlanTasks` tests still pass (backward compatibility)

## Task 6: Update exports and barrel file

- [x] 6.1 Export all new types and functions from `src/plan.ts`
- [x] 6.2 Verify barrel file (`src/index.ts`) includes new exports if applicable
- [x] 6.3 Run full test suite and lint to confirm no regressions

## Task 7: Update forge-plan SKILL.md for lightweight format

- [x] 7.1 Add Lightweight Task format section to `skills/forge-plan/SKILL.md` §3 (alongside existing Atomic Task format)
- [x] 7.2 Update §2 Step 3 (Task Breakdown) to describe lightweight task generation when design.md exists
- [x] 7.3 Update §4 (Self-Check) to reflect adapted self-check rules (placeholder scope change, Design Reference validation, removal of type consistency check)
- [x] 7.4 Update §7 (Plan Document Format) to document the new `format` frontmatter field and lightweight document structure
- [x] 7.5 Add fallback behavior description: when no design.md exists, use full Atomic Task format

## Task 8: Update forge-build SKILL.md for consuming lightweight plans

- [x] 8.1 Update §3.2 (Standard Path) to describe how build reads Design References and loads relevant design.md sections
- [x] 8.2 Update Subagent instruction construction (§3.2) to include Design Reference context instead of full TDD code from plan
- [x] 8.3 Add guidance for build phase TDD when working from lightweight tasks (build writes RED/GREEN/REFACTOR code guided by design.md)
- [x] 8.4 Ensure §2 (Pre-checks) gate logic works with both `format: "lightweight"` and `format: "full"` plans
