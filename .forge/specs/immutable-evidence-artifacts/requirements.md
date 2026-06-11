---
feature: "immutable-evidence-artifacts"
status: "completed"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Requirements — immutable-evidence-artifacts

## Purpose

Forge needs a standard evidence model for review, test, ship, verify, mutation, docs, and dist-sync outputs. The model must prevent stale claims and in-place verdict overwrites.

## Glossary

| Term | Definition |
|------|------------|
| Evidence Artifact | Immutable JSON record describing a verification event. |
| Artifact Index | Append-only index that links artifacts by topic, run id, phase, and commit. |
| Verdict | Human-readable conclusion that must cite artifact ids. |

## Requirements

### Requirement 1: Standard Artifact Schema

Forge SHALL write verification evidence using a single versioned schema.

#### Acceptance Criteria

- Artifact records SHALL include id, kind, topic, run id, trace id, commit, command, exit code, timestamp, producer, input hash, and result.
- Artifact kinds SHALL include review, test, ship_gate, verify, mutation, docs_check, and dist_sync.
- Artifact schema validation SHALL reject records without commit or timestamp.

### Requirement 2: Immutable Writes

Forge SHALL never overwrite an existing artifact.

#### Acceptance Criteria

- Writing an artifact with an existing id SHALL fail.
- A new artifact MAY declare `supersedes` to retract or replace an older artifact.
- Verdict files SHALL reference artifact ids instead of embedding unsupported pass claims.

### Requirement 3: Freshness Checking

Forge SHALL evaluate whether review/test/ship claims are fresh for the current commit.

#### Acceptance Criteria

- A review artifact older than the current HEAD SHALL be stale unless the changed file set is proven irrelevant.
- A test artifact older than the current HEAD SHALL be stale unless the command input hash matches.
- Ship SHALL block on stale required artifacts unless an explicit force artifact exists.

### Requirement 4: Compatibility with Existing Reports

Forge SHALL preserve current markdown reports as human-readable views.

#### Acceptance Criteria

- Existing `.forge/reviews/*.md` reports remain readable.
- New review reports include artifact references.
- Existing ship gate JSON is either migrated or wrapped by an artifact record.

## Non-Functional Requirements

- Artifact files SHALL be deterministic JSON.
- Artifact ids SHALL be stable enough for cross-reference and unique enough for concurrent writes.
- The model SHALL support future remote CI artifacts.

## Out of Scope

- Replacing all markdown reports.
- Building a web dashboard.
