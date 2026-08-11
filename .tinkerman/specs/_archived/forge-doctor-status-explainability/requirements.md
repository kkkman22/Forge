---
feature: "forge-doctor-status-explainability"
status: "archived"
archived_reason: "功能被 src/doctor.ts + src/evidence-artifact.ts 吸收"
archived_replacement: "doctor 模块内建"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Requirements — forge-doctor-status-explainability

## Purpose

Users need one place to see current phase, gate health, review freshness, coverage, dist-sync, docs drift, and why the next step can or cannot run.

## Requirements

### Requirement 1: Unified Health Snapshot

Forge SHALL compute a read-only health snapshot for the current task.

#### Acceptance Criteria

- The snapshot SHALL include current task, tier, phase, branch, worktree state, spec status, plan status, progress, review freshness, test freshness, ship gate state, dist-sync state, docs drift state, and tool health.
- Missing optional data SHALL be reported as unknown, not pass.
- Snapshot computation SHALL not modify files.

### Requirement 2: Explain Next Step

Forge SHALL explain whether the next phase can execute.

#### Acceptance Criteria

- When the next phase is allowed, status SHALL show the graph edge and satisfied gates.
- When the next phase is blocked, status SHALL show each blocking reason and its source file/artifact.
- When a status value is stale or inconsistent, status SHALL label it as inferred or uncertain.

### Requirement 3: CLI and Slash Command Views

Forge SHALL expose the health model through `forge-doctor`, `forge-status`, and `/forge status`.

#### Acceptance Criteria

- `forge-doctor` SHALL show full health details.
- `forge-status` SHALL show a concise summary plus next-step explanation.
- `/forge status` SHALL use the same underlying health model.

## Non-Functional Requirements

- Health checks SHALL complete quickly on medium repositories.
- Expensive checks MAY be marked skipped unless explicitly requested.
- Output SHALL be deterministic enough for tests.

## Out of Scope

- Web dashboard.
- Automatic remediation.
