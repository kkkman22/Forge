---
feature: "forge-doctor-status-explainability"
status: "draft"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
spec_ref: ".tinkerman/specs/forge-doctor-status-explainability/requirements.md"
---

# Tasks — forge-doctor-status-explainability

## Task Dependency Graph

```json
{
  "waves": [
    { "name": "Health Model", "tasks": ["T-01", "T-02"] },
    { "name": "Renderers", "tasks": ["T-03", "T-04"] },
    { "name": "Integration", "tasks": ["T-05", "T-06"] }
  ],
  "dependencies": {
    "T-02": ["T-01"],
    "T-03": ["T-02"],
    "T-04": ["T-03"],
    "T-05": ["T-04"],
    "T-06": ["T-05"]
  }
}
```

## Task Definitions

#### T-01 Add Health Snapshot Types

- **Goal**: Define health model and check result types.
- **TDD Steps**: RED: type and fixture tests. GREEN: implement types/helpers. REFACTOR: align naming with graph/artifacts.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/doctor*.test.ts`

#### T-02 Implement Health Aggregator

- **Goal**: Read status/progress/branch/artifacts/docs/dist data into snapshot.
- **TDD Steps**: RED: missing/stale fixtures. GREEN: implement aggregator. REFACTOR: separate expensive checks.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/doctor*.test.ts`
- **Depends On**: T-01

#### T-03 Implement Next-Step Explanation

- **Goal**: Use workflow graph and gates to explain allowed/blocked next phase.
- **TDD Steps**: RED: blocked examples. GREEN: implement reason builder. REFACTOR: stable reason codes.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/doctor*.test.ts`
- **Depends On**: T-02

#### T-04 Add Renderers

- **Goal**: Render full doctor view and concise status view.
- **TDD Steps**: RED: renderer snapshots. GREEN: implement renderers. REFACTOR: keep output compact.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/doctor*.test.ts`
- **Depends On**: T-03

#### T-05 Wire `/forge status`

- **Goal**: Update status instruction/function contracts to use shared health model.
- **TDD Steps**: RED: contract test. GREEN: update instructions and exports. REFACTOR: remove duplicated status logic.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/status-manager.test.ts test/status-resolver.test.ts test/contract*.test.ts`
- **Depends On**: T-04

#### T-06 Add Terminal Command Coverage

- **Goal**: Verify `forge-doctor` and `forge-status` distribution behavior.
- **TDD Steps**: RED: manifest/bin fixture fails. GREEN: wire wrappers or correct docs. REFACTOR: align README.
- **Verify Command**: `npx tsc --noEmit && npm run check`
- **Depends On**: T-05
