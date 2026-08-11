---
feature: "forge-doctor-status-explainability"
status: "draft"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Design — forge-doctor-status-explainability

## Overview

Introduce `src/doctor.ts` as a pure-ish health aggregator. It consumes workflow graph, artifact index, status manager, ship gates, docs governance checks, and dist-sync checks.

## Architecture

| Component | Responsibility |
|-----------|----------------|
| `doctor.ts` | Build `ForgeHealthSnapshot`. |
| `doctor-renderer.ts` | Render full and concise views. |
| `status` skill | Call the health model instead of manually reading files. |
| `bin` scripts | Provide `forge-doctor` and `forge-status` wrappers if distribution supports bin exposure. |

## Data Model

```ts
interface ForgeHealthSnapshot {
  task: { id: string; name: string; tier?: string; phase?: string };
  nextStep: { phase: string | null; allowed: boolean; reasons: HealthReason[] };
  gates: Record<string, HealthCheck>;
  artifacts: { latestReview?: string; latestTest?: string; latestShip?: string };
  generatedAt: string;
}
```

## Current State

`/forge status` is instruction-driven and mainly reads status/progress. README advertises terminal commands, but the product behavior is not backed by a shared health model.

## Testing Strategy

- Unit tests for next-step reasoning.
- Fixture tests for missing status, stale review, dirty worktree, and dist drift.
- Snapshot tests for concise/full renderer output.

## Rollout

1. Add pure health model and tests.
2. Wire `/forge status` to use model.
3. Add terminal wrappers where plugin distribution supports them.
4. Add optional expensive checks.

## Reversibility

Keep old status instruction output as fallback until the health model covers single-task and multi-task modes.
