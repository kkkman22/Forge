---
feature: skill-behavioral-guardrails
layout: tasks
created: 2026-05-01
spec_ref: ".tinkerman/specs/skill-behavioral-guardrails/requirements.md"
---

# Tasks

## Task 1: Add Not For paragraphs to all 17 SKILLs

- [x] 1.1 Add "Not For" paragraph to `skills/forge-router/SKILL.md` after Overview section
- [x] 1.2 Add "Not For" paragraph to `skills/forge-spec/SKILL.md` after Overview section
- [x] 1.3 Add "Not For" paragraph to `skills/forge-plan/SKILL.md` after Overview section
- [x] 1.4 Add "Not For" paragraph to `skills/forge-build/SKILL.md` after Overview section
- [x] 1.5 Add "Not For" paragraph to `skills/forge-build-light/SKILL.md` after Overview section
- [x] 1.6 Add "Not For" paragraph to `skills/forge-review/SKILL.md` after Overview section
- [x] 1.7 Add "Not For" paragraph to `skills/forge-test/SKILL.md` after Overview section
- [x] 1.8 Add "Not For" paragraph to `skills/forge-ship/SKILL.md` after Overview section
- [x] 1.9 Add "Not For" paragraph to `skills/forge-decide/SKILL.md` after Overview section
- [x] 1.10 Add "Not For" paragraph to `skills/forge-learn/SKILL.md` after Overview section
- [x] 1.11 Add "Not For" paragraph to `skills/forge-debug/SKILL.md` after Overview section
- [x] 1.12 Add "Not For" paragraph to `skills/forge-resume/SKILL.md` after Overview section
- [x] 1.13 Add "Not For" paragraph to `skills/forge-status/SKILL.md` after Overview section
- [x] 1.14 Add "Not For" paragraph to `skills/forge-abort/SKILL.md` after Overview section
- [x] 1.15 Add "Not For" paragraph to `skills/forge-loop/SKILL.md` after Overview section
- [x] 1.16 Add "Not For" paragraph to `skills/forge-fix/SKILL.md` after Overview section
- [x] 1.17 Add "Not For" paragraph to `skills/forge-refactor/SKILL.md` after Overview section

## Task 2: Add Common Rationalizations to core execution SKILLs (6 files, ≥3 rows each)

- [x] 2.1 Add Common Rationalizations table to `skills/forge-spec/SKILL.md` (3 rows: spec-skipping excuses)
- [x] 2.2 Add Common Rationalizations table to `skills/forge-plan/SKILL.md` (3 rows: planning-skipping excuses)
- [x] 2.3 Add Common Rationalizations table to `skills/forge-build/SKILL.md` (3 rows: TDD/testing-skipping excuses)
- [x] 2.4 Add Common Rationalizations table to `skills/forge-review/SKILL.md` (3 rows: review-skipping excuses)
- [x] 2.5 Add Common Rationalizations table to `skills/forge-ship/SKILL.md` (3 rows: gate-skipping excuses)
- [x] 2.6 Add Common Rationalizations table to `skills/forge-decide/SKILL.md` (3 rows: decision-skipping excuses)

## Task 3: Add Common Rationalizations to auxiliary SKILLs (6 files, ≥3 rows each)

- [x] 3.1 Add Common Rationalizations table to `skills/forge-learn/SKILL.md` (3 rows: knowledge-capture-skipping excuses)
- [x] 3.2 Add Common Rationalizations table to `skills/forge-debug/SKILL.md` (3 rows: investigation-skipping excuses)
- [x] 3.3 Add Common Rationalizations table to `skills/forge-resume/SKILL.md` (3 rows: recovery-skipping excuses)
- [x] 3.4 Add Common Rationalizations table to `skills/forge-abort/SKILL.md` (3 rows: abort-avoidance excuses)
- [x] 3.5 Add Common Rationalizations table to `skills/forge-status/SKILL.md` (3 rows: status-check-skipping excuses)
- [x] 3.6 Add Common Rationalizations table to `skills/forge-loop/SKILL.md` (3 rows: autonomous-mode-avoidance excuses)

## Task 4: Add Common Rationalizations to lightweight variant SKILLs (3 files, ≥2 rows each)

- [x] 4.1 Add Common Rationalizations table to `skills/forge-build-light/SKILL.md` (2 rows)
- [x] 4.2 Add Common Rationalizations table to `skills/forge-fix/SKILL.md` (2 rows)
- [x] 4.3 Add Common Rationalizations table to `skills/forge-refactor/SKILL.md` (2 rows)

## Task 5: Verify consistency and run contract tests

- [x] 5.1 Verify all 17 SKILL.md files have both "Not For" and "Common Rationalizations" sections
- [x] 5.2 Verify forge-test SKILL.md was NOT modified (already has §3.4)
- [x] 5.3 Verify no existing content was altered in any SKILL.md
- [x] 5.4 Run `npm run check` to confirm contract.test.ts and all other tests pass
