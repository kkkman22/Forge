---
feature: "mutation-gate-rollout"
status: completed
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Requirements — mutation-gate-rollout

## Purpose

Mutation testing should move from pack-only warn mode to layered gate coverage for Forge's highest-risk decision modules.

## Requirements

### Requirement 1: Critical Module Targeting

Forge SHALL define first-party mutation target tiers.

#### Acceptance Criteria

- Tier 1 SHALL cover ship gate, review gate, path validator, and spec validation modules.
- Tier 2 MAY cover workflow graph and artifact freshness modules.
- Targets SHALL be explicit and reviewable.

### Requirement 2: Layered Gate Behavior

Forge SHALL apply mutation results differently by tier.

#### Acceptance Criteria

- Tier 1 mutation score below threshold SHALL block the mutation gate.
- Tier 2 mutation score below threshold SHALL warn by default.
- No configured targets SHALL remain a warning, not a pass.

### Requirement 3: Runtime Discipline

Mutation runs SHALL stay bounded.

#### Acceptance Criteria

- Mutation commands SHALL support target subsets.
- Mutation runs SHALL have timeout and concurrency controls.
- Full mutation SHALL not run inside default `npm run check` unless explicitly configured.

## Out of Scope

- Full repository mutation testing.
- Requiring mutation for every PR.
