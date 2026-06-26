---
feature: "evidence-chain-replay"
status: completed
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Requirements — evidence-chain-replay

## Purpose

Users should be able to trace a task from decision/spec through plan, build, review, test, ship, and learn with linked decisions and verification evidence.

## Requirements

### Requirement 1: Build a Timeline

Forge SHALL produce a chronological timeline for a topic.

#### Acceptance Criteria

- The timeline SHALL include decisions, specs, plans, progress, reviews, findings, debug notes, ship records, and evidence artifacts.
- Each entry SHALL include path or artifact id, timestamp, stage, status/result, and short summary.
- Missing stages SHALL be shown explicitly.

### Requirement 2: Evidence Chain

Forge SHALL connect claims to verification artifacts.

#### Acceptance Criteria

- Review pass/fail entries SHALL cite review artifacts.
- Test entries SHALL cite test artifacts.
- Ship entries SHALL cite all gate artifacts used by ship.
- Superseded artifacts SHALL remain visible but marked superseded.

### Requirement 3: Human-Readable Replay

Forge SHALL render replay output for local reading and command output.

#### Acceptance Criteria

- `forge replay <topic>` or equivalent SHALL output a concise timeline.
- A dossier markdown file MAY be regenerated from the same data.
- Output SHALL distinguish fact, inference, and missing evidence.

## Out of Scope

- Interactive UI.
- Editing artifacts during replay.
