---
feature: "workflow-graph-dsl"
status: "draft"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
spec_ref: ".forge/specs/workflow-graph-dsl/requirements.md"
---

# Tasks — workflow-graph-dsl

## Overview

Implement the workflow graph as a behavior-preserving migration first, then wire docs generation.

## Task Dependency Graph

```json
{
  "waves": [
    { "name": "Model", "tasks": ["T-01", "T-02"] },
    { "name": "Runtime Wiring", "tasks": ["T-03", "T-04"] },
    { "name": "Docs and Drift", "tasks": ["T-05", "T-06"] }
  ],
  "dependencies": {
    "T-03": ["T-01", "T-02"],
    "T-04": ["T-03"],
    "T-05": ["T-04"],
    "T-06": ["T-05"]
  }
}
```

## Task Definitions

#### T-01 Add Workflow Graph Model

- **Goal**: Create `src/workflow-graph.ts` with phase/profile types and behavior-preserving graph data.
- **TDD Steps**: RED: add validation and sequence parity tests. GREEN: implement model. REFACTOR: simplify helpers.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/workflow-graph*.test.ts`
- **Definition of Done**: All existing feature/refactor/bugfix sequences are represented.

#### T-02 Add Graph Validation

- **Goal**: Validate duplicate ids, missing references, terminal reachability, and disallowed cycles.
- **TDD Steps**: RED: invalid graph fixtures fail. GREEN: implement validator. REFACTOR: expose diagnostics.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/workflow-graph*.test.ts`
- **Definition of Done**: Diagnostics include stable codes.

#### T-03 Migrate Scheduler Lookup

- **Goal**: Replace `SKILL_COMMAND_SEQUENCES` with graph lookup while preserving public API.
- **TDD Steps**: RED: scheduler parity test. GREEN: wire graph. REFACTOR: remove duplicate constants.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/skill-scheduler-resilience.test.ts test/build-nature-mode.property.test.ts`
- **Definition of Done**: Scheduler outputs match pre-migration outputs.
- **Depends On**: T-01, T-02

#### T-04 Migrate Router Lookup

- **Goal**: Replace router command sequence literal with graph lookup.
- **TDD Steps**: RED: router parity test. GREEN: wire graph. REFACTOR: centralize sequence key mapping.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/router.property.test.ts test/router-worknature.property.test.ts`
- **Definition of Done**: Router classification tests remain green.
- **Depends On**: T-03

#### T-05 Generate Docs SSOT

- **Goal**: Generate workflow/routing SSOT from graph data.
- **TDD Steps**: RED: docs SSOT drift test. GREEN: add generator. REFACTOR: reuse existing renderers.
- **Verify Command**: `npx tsc --noEmit && npm run docs:check`
- **Definition of Done**: README and docs workflow tables are generated from one source.
- **Depends On**: T-04

#### T-06 Add Sequence Drift Gate

- **Goal**: Ensure hard-coded workflow sequences cannot drift unnoticed.
- **TDD Steps**: RED: fixture with stale sequence fails. GREEN: implement drift checker. REFACTOR: add helpful diagnostics.
- **Verify Command**: `npx tsc --noEmit && npm run check`
- **Definition of Done**: `npm run check` blocks ungenerated sequence drift.
- **Depends On**: T-05
