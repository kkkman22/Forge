---
feature: ship-gate-commit-verification
layout: tasks
created: 2026-05-01
spec_ref: ".tinkerman/specs/ship-gate-commit-verification/requirements.md"
---

# Tasks

## Task 1: Update review.ts types and SKILL.md

- [x] 1.1 Add `reviewed_at_commit?: string` field to `ReviewReportFrontmatter` type in `src/review.ts`
- [x] 1.2 Update forge-review SKILL.md §9 frontmatter template to include `reviewed_at_commit` field
- [x] 1.3 Update forge-review SKILL.md §10 execution flow Step 3 to record `git rev-parse HEAD` when writing the report
- [x] 1.4 Run `npm run typecheck` to verify no type errors

## Task 2: Implement checkReviewFreshness pure function

- [x] 2.1 Add `ReviewFreshnessResult` interface and `checkReviewFreshness` function to `src/ship.ts`
- [x] 2.2 Implement 4 cases: undefined commit → fresh; same commit → fresh; diff only .tinkerman/ → fresh; project code changed → not fresh
- [x] 2.3 Write property-based tests in `test/ship-freshness.property.test.ts` for Properties 1-4 using fast-check
- [x] 2.4 Write unit tests in `test/ship.test.ts` (or extend existing) for edge cases: empty file list, empty commit hash

## Task 3: Update forge-ship SKILL.md gate checks

- [x] 3.1 Add "Review Freshness Check" subsection to §2 Gate Checks, after existing Review Gate
- [x] 3.2 Define the comparison logic: same → pass, missing → pass (backward compat), diff only .tinkerman/ → pass, project code → warning
- [x] 3.3 Define warning output format with file list and recommendation
- [x] 3.4 Explicitly state this check does NOT hard-block ship

## Task 4: Verify and test

- [x] 4.1 Run `npm run check` to confirm all tests pass (typecheck + lint + test)
- [x] 4.2 Verify contract.test.ts passes (SKILL frontmatter format changes are valid)
- [x] 4.3 Verify existing ship.ts tests still pass
- [x] 4.4 Verify backward compatibility: review reports without `reviewed_at_commit` don't cause errors
