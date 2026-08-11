---
feature: "mutation-gate-rollout"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
spec_ref: ".tinkerman/specs/mutation-gate-rollout/requirements.md"
---

# Tasks — mutation-gate-rollout

## Task Dependency Graph

```json
{
  "waves": [
    { "name": "Model", "tasks": ["T-01", "T-02"] },
    { "name": "Runtime", "tasks": ["T-03", "T-04"] },
    { "name": "Gate", "tasks": ["T-05"] }
  ],
  "dependencies": {
    "T-02": ["T-01"],
    "T-03": ["T-02"],
    "T-04": ["T-03"],
    "T-05": ["T-04"]
  }
}
```

## Task Definitions

#### T-01 Define First-Party Targets

- **Goal**: Add explicit target groups for critical Forge modules.
- **TDD Steps**: RED: target collection tests. GREEN: implement groups. REFACTOR: keep config reviewable.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/mutate.test.ts`

#### T-02 Add Tiered Verdict Model

- **Goal**: Support pass/warn/fail based on target group policy.
- **TDD Steps**: RED: low score required target fails. GREEN: implement verdict. REFACTOR: shared thresholds.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/mutate.test.ts`
- **Depends On**: T-01

#### T-03 Add Target Group CLI Support

- **Goal**: Allow mutation to run selected target groups.
- **TDD Steps**: RED: command parse tests. GREEN: wire flags. REFACTOR: help output.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/mutate.test.ts test/ship-command-parse.test.ts`
- **Depends On**: T-02

#### T-04 Write Mutation Evidence Artifact

- **Goal**: Store mutation results as evidence artifacts.
- **TDD Steps**: RED: artifact missing. GREEN: integrate artifact writer. REFACTOR: keep markdown report.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/mutate.test.ts test/evidence-artifact*.test.ts`
- **Depends On**: T-03

#### T-05 Wire Optional Ship Gate

- **Goal**: Make required mutation artifacts block ship when configured.
- **TDD Steps**: RED: missing required artifact passes. GREEN: gate integration. REFACTOR: clear diagnostics.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/ship-gates.test.ts test/mutate.test.ts`
- **Depends On**: T-04
