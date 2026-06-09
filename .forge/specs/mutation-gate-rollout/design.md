---
feature: "mutation-gate-rollout"
status: "draft"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Design — mutation-gate-rollout

## Overview

Extend `src/mutate.ts` with first-party target groups and tiered verdict behavior. Keep pack-driven mutation support.

## Current State

Mutation testing collects `mutation_critical_modules` from enabled packs and writes warn/pass artifacts. It never fails.

## Proposed Change

Add first-party config:

```ts
const FIRST_PARTY_MUTATION_TARGETS = {
  gate_core: ["src/ship-gates.ts", "src/ship.ts", "src/review/quality-gate.ts"],
  validators: ["src/mcp/tools/path-validator.ts", "src/spec-validation.ts"]
};
```

Verdict:

- `required` target group: fail below threshold.
- `advisory` target group: warn below threshold.
- pack-only group: preserve current behavior unless configured otherwise.

## Testing Strategy

- Unit tests for target collection order and verdict computation.
- Integration test using fake Stryker JSON.
- Ship gate test for required mutation artifact.

## Rollout

1. Add target groups and verdict model.
2. Add command flags for target group.
3. Add artifact output using evidence artifact model.
4. Wire required Tier 1 gate into ship after baseline stabilizes.

## Reversibility

Keep ship integration behind config until mutation timing and score are stable.
