---
feature: "workflow-graph-dsl"
status: "completed"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Requirements — workflow-graph-dsl

## Purpose

Forge currently stores workflow sequences in router code, scheduler code, skill instructions, docs, README, and tests. This spec introduces a workflow graph DSL as the single source of truth for command sequences, phase transitions, gates, artifacts, and generated documentation.

## Glossary

| Term | Definition |
|------|------------|
| Workflow Graph | Typed lifecycle graph for `/forge` phases and transitions. |
| Workflow Profile | A named variant such as feature/light, bugfix/standard, or refactor/standard. |
| Phase Node | One phase in the graph, such as plan, build, review, test, ship. |
| Gate Edge | A transition with required conditions and failure behavior. |

## Requirements

### Requirement 1: Single Source for Command Sequences

Forge SHALL define workflow sequences in one typed graph source and derive router, scheduler, documentation, and tests from that source.

#### Acceptance Criteria

- When a tier sequence is requested by router classification, the router SHALL read from the workflow graph rather than a local literal array.
- When a skill sequence is requested by the scheduler, the scheduler SHALL read from the workflow graph rather than a local literal array.
- When docs render tier tables, the docs SSOT SHALL read the same workflow graph data.
- When a command sequence changes, tests SHALL fail if README/docs/skills still contain stale generated sequence output.

### Requirement 2: Model Phase Semantics

Forge SHALL represent each lifecycle phase with metadata needed by execution and explanation layers.

#### Acceptance Criteria

- Each phase SHALL declare id, display name, allowed tier/profile membership, required inputs, produced artifacts, commit behavior, and terminal behavior.
- Each transition SHALL declare source, target, success condition, failure condition, and recovery route.
- The graph SHALL represent light, standard, full, refactor, and bugfix workflows.
- The graph SHALL support future policy profiles without changing router or scheduler public APIs.

### Requirement 3: Backward Compatibility

Forge SHALL keep existing exported router and scheduler APIs stable during the migration.

#### Acceptance Criteria

- Existing tests importing `classifyTask`, `getCommandSequence`, and `determineNextSkill` SHALL continue to compile.
- Existing status frontmatter `skill_sequence` values SHALL remain readable.
- Unknown legacy tier keys SHALL degrade to the standard workflow sequence.

### Requirement 4: Graph Validation

Forge SHALL reject invalid workflow graphs before runtime use.

#### Acceptance Criteria

- Duplicate phase ids SHALL be reported as errors.
- Missing transition targets SHALL be reported as errors.
- Cycles SHALL be allowed only when explicitly marked as recovery loops.
- A workflow profile without a terminal phase SHALL be invalid.

## Non-Functional Requirements

- The graph loader SHALL be pure and deterministic.
- Graph validation SHALL run inside `npm run check`.
- The source format SHALL be friendly to code review.

## Out of Scope

- Rewriting plan task DAG execution.
- Changing command names.
- Adding a UI.

## Delta

### Added

- Workflow graph model and validation.
- SSOT renderer input for workflow tables.

### Modified

- Router sequence lookup.
- Scheduler sequence lookup.
- Docs sequence rendering.

### Unchanged

- Existing `/forge` command names.
- Current tier semantics unless graph data explicitly encodes them.
