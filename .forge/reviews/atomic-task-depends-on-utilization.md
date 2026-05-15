---
topic: "atomic-task-depends-on-utilization"
date: "2026-05-15"
result: "pass"
reviewed_at_commit: "de1ade5f8f1102f8ec21df8178ff1fbbd52a83da"
p0_count: 0
p1_count: 0
p2_count: 5
p3_count: 5
layers:
  - spec-check
  - quality-check
  - security-check
---

# Review: atomic-task-depends-on-utilization

## Summary

Verification-only feature. All spec deliverables pre-exist on main. 9/9 acceptance criteria pass. No P0/P1 findings.

**Result**: ✅ PASS | P0:0 | P1:0 | P2:5 | P3:5

## Layer 1 — Spec Alignment

All 9 acceptance criteria verified:

| AC | Status | Evidence |
|----|--------|----------|
| AC1: plan outputs dependsOn | ✅ PASS | SKILL.md:56-66 (Step 3.5) + plan.ts:94-103 |
| AC2: Step 4 validates graph | ✅ PASS | SKILL.md:78 + task-graph.ts:57-94 |
| AC3: plan markdown shows Depends On | ✅ PASS | atomic-task-format.md:11 + lightweight-task-format.md:19 |
| AC4: old plans still parse | ✅ PASS | plan.ts:99 (undefined → []) |
| AC5: build follows topo order | ✅ PASS | build SKILL.md:89 |
| AC6: review Layer 2 checks commit order | ✅ PASS | review SKILL.md:166 |
| AC7: autonomous mode auto-corrects | ✅ PASS | SKILL.md:78 + dependency-rules.md:24 |
| AC8: PBT round-trip | ✅ PASS | depends-on.property.test.ts (5 tests) |
| AC9: zero regression | ✅ PASS | 409 files / 5420 tests / 0 failures |

Scope Creep: None. All changes within spec boundaries.

## Layer 2 — Code Quality

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| Q1 | P2 | src/plan.ts:295-342 | Duplicate cycle detection mirrors task-graph.ts:100-140 | Consolidate: convert to TaskGraph, reuse detectCycle |
| Q2 | P2 | src/plan.ts:348-368 | validateTopologicalOrder duplicates topo validation | Remove or consolidate with task-graph topologicalOrder |
| Q3 | P2 | src/plan.ts:94-103 | toTaskGraph lacks duplicate taskNumber validation | Add uniqueness check before mapping |
| Q4 | P3 | src/task-graph.ts:235 | topologicalOrder returns null on cycle, no error in callers | Document null contract or throw typed error |
| Q5 | P3 | test/plan/graph-validation.test.ts:53 | Self-dependency test only checks boolean, not error message | Assert specific error message |

## Layer 3 — Security & Risk

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| S1 | P3 | src/plan.ts:272-289 | No explicit type check for dependsOn entries (negative/non-integer) | Defense-in-depth: add explicit validation (existing membership check already mitigates) |
| S2 | P2 | src/plan.ts:99 | toTaskGraph trusts dependsOn without sanitization | Filter invalid values before mapping |
| S3 | P2 | src/task-graph.ts:80-81 | Auto-correction on self-dependency could silently corrupt | Fail hard instead of auto-correcting |
| S4 | P2 | src/plan.ts:310-312 | Kahn's algorithm adjacency access edge case | Add defensive null-check |
| S5 | P3 | src/task-graph.ts:242-245 | completeTask mutates without validating taskId | Add null-check with explicit error |

**P1 downgrade note (S1)**: Original finding was P1. Downgraded to P3 because `validateDependencies` membership check (`!taskNumbers.has(dep)`) catches all invalid values (negative, NaN, Infinity, non-integer). TypeScript type system provides compile-time guard.

## Gate Decision

**P0/P1 count: 0** → Ship unblocked. P2/P3 findings are advisory for future cleanup.
