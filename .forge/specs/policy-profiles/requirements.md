---
feature: "policy-profiles"
status: "completed"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Requirements — policy-profiles

## Purpose

Forge should support different process cost levels for personal projects, team collaboration, and enterprise compliance without weakening the default team workflow.

## Requirements

### Requirement 1: Profile Definitions

Forge SHALL define policy profiles for solo, team, and enterprise use.

#### Acceptance Criteria

- `solo` SHALL reduce optional gates while preserving TDD and basic review.
- `team` SHALL match current default behavior.
- `enterprise` SHALL require stronger artifact, review, and force-skip evidence.

### Requirement 2: Workflow Graph Integration

Policy profiles SHALL modify workflow graph gate requirements rather than scattering config checks.

#### Acceptance Criteria

- Profile selection SHALL affect required phases, gates, artifacts, and review layers through graph metadata.
- Router and scheduler APIs SHALL continue to work with default profile.
- Doctor/status SHALL show active profile and profile-specific blockers.

### Requirement 3: Configuration and Migration

Forge SHALL default existing projects to team behavior unless explicitly configured.

#### Acceptance Criteria

- Missing profile config SHALL resolve to `team`.
- Invalid profile config SHALL produce a diagnostic and fall back safely.
- Docs SHALL explain profile tradeoffs.

## Out of Scope

- Role-based access control.
- Remote policy service.
