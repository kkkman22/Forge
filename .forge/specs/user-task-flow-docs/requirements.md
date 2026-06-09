---
feature: "user-task-flow-docs"
status: "draft"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Requirements — user-task-flow-docs

## Purpose

Forge documentation should guide users by task flow instead of exposing internal command inventory first.

## Requirements

### Requirement 1: Task-Flow Navigation

Forge SHALL reorganize top-level docs around common user jobs.

#### Acceptance Criteria

- README SHALL route users to task flows: fix a bug, build a clear feature, explore a vague requirement, inspect ship readiness.
- Command reference SHALL remain available but secondary.
- Beginner onboarding SHALL explain outcomes before internal phases.

### Requirement 2: Preserve SSOT Governance

Documentation SHALL continue to use docs governance and generated blocks.

#### Acceptance Criteria

- Workflow sequence tables SHALL be generated from workflow graph SSOT.
- Command counts SHALL remain generated.
- Docs index and bilingual checks SHALL pass.

### Requirement 3: Reduce Cognitive Load

Docs SHALL avoid requiring new users to learn all commands before using Forge.

#### Acceptance Criteria

- Quick start SHALL include one bugfix and one standard feature path.
- Each task-flow page SHALL include "what Forge will do" and "what user must decide".
- Advanced reference SHALL retain all implementation details.

## Out of Scope

- Removing reference docs.
- Marketing landing page.
