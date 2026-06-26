---
feature: "workflow-graph-dsl"
status: draft
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Design — workflow-graph-dsl

## Overview

Add `src/workflow-graph.ts` as the canonical typed workflow model. The graph should replace local sequence constants in `src/router.ts` and `src/skill-scheduler.ts`, then feed docs SSOT and sequence drift tests.

## Current State

- Router owns full interactive sequences in `src/router.ts`.
- Scheduler owns skill execution sequences in `src/skill-scheduler.ts`.
- Existing `src/task-graph.ts` models plan task dependencies only.
- Docs and skills contain repeated sequence literals.

## Proposed Change

Create a workflow graph module with:

```ts
export interface WorkflowPhase {
  id: string;
  displayName: string;
  producesArtifacts: string[];
  commitBehavior: "never" | "on_success" | "phase_owned";
  terminal?: boolean;
}

export interface WorkflowProfile {
  id: string;
  tier: "light" | "standard" | "full";
  workNature: "feature" | "refactor" | "bugfix";
  phases: string[];
}

export interface WorkflowGraph {
  schemaVersion: 1;
  phases: WorkflowPhase[];
  profiles: WorkflowProfile[];
}
```

Use an in-code constant first. Add JSON export only after the model stabilizes.

## Architecture

| Component | Change |
|-----------|--------|
| `src/workflow-graph.ts` | New canonical graph, validation, lookup helpers. |
| `src/router.ts` | Replace local command sequence constant with graph lookup. |
| `src/skill-scheduler.ts` | Replace local skill sequence constant with graph lookup. |
| `docs/_ssot/workflows.json` | Generated from graph for docs rendering. |
| docs governance renderers | Add workflow table renderer or extend routing renderer. |

## Component Interfaces

- `getRouterSequence(tier, workNature?)`
- `getSchedulerSequence(profileId)`
- `validateWorkflowGraph(graph)`
- `renderWorkflowSsot(graph)`

## Testing Strategy

- Unit tests for graph validation.
- Parity tests proving old sequence outputs remain identical.
- Drift tests for README/docs generated blocks.
- Property tests for profile lookup totality.

## Rollout

1. Add graph and tests without changing behavior.
2. Migrate scheduler lookup.
3. Migrate router lookup.
4. Generate docs SSOT and update docs.
5. Remove local sequence constants after parity tests pass.

## Reversibility

Keep existing constants as test fixtures during the first migration. Revert by switching router/scheduler imports back to local constants.

## Open Questions

- Whether graph source should remain TypeScript or move to JSON/YAML after v1.
- Whether skill instructions should embed generated sequence blocks or only reference docs.
