---
feature: "immutable-evidence-artifacts"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Design — immutable-evidence-artifacts

## Overview

Add an artifact layer under `.tinkerman/artifacts/` and route review/test/ship/verify evidence through it. Markdown files remain as views, not source of truth.

## Current State

- Review reports use markdown frontmatter.
- Ship gates write `.tinkerman/ship/<run-id>-gates.json`.
- Verify writes claim/verdict files under findings.
- Workflow audit appends JSON blocks to markdown.

## Proposed Change

Create `src/evidence-artifact.ts` with schema, writer, indexer, and freshness helpers.

Artifact path:

```text
.tinkerman/artifacts/<run-id>/<artifact-id>.json
.tinkerman/artifacts/index.jsonl
```

Schema:

```ts
interface EvidenceArtifact {
  schema_version: 1;
  artifact_id: string;
  kind: "review" | "test" | "ship_gate" | "verify" | "mutation" | "docs_check" | "dist_sync";
  topic: string;
  run_id: string;
  trace_id?: string;
  commit: string;
  command?: string;
  exit_code?: number;
  stdout_tail?: string;
  stderr_tail?: string;
  input_hash?: string;
  result: "pass" | "fail" | "warn" | "blocked" | "inconclusive";
  producer: string;
  created_at: string;
  supersedes?: string;
}
```

## Architecture

| Component | Responsibility |
|-----------|----------------|
| `evidence-artifact.ts` | Schema, validation, id generation, immutable write. |
| `artifact-index.ts` | Append-only index and query helpers. |
| `review` integration | Create review artifact and cite it in report frontmatter. |
| `test` integration | Create test artifact from command output. |
| `ship` integration | Require fresh artifacts and write ship gate artifact. |
| `verify` integration | Convert claim/verdict into artifact-backed verdict. |

## Error Handling

- Existing artifact id: return diagnostic and do not modify files.
- Index append failure: fail the producing gate.
- Missing commit: artifact invalid.

## Testing Strategy

- Property tests for artifact id uniqueness and immutable write behavior.
- Unit tests for freshness logic.
- Integration tests for ship blocking stale review/test artifacts.

## Rollout

1. Implement artifact writer and index without changing gates.
2. Wrap ship gate reports as artifacts.
3. Add review/test artifact production.
4. Make ship consume artifacts for freshness.
5. Migrate verify artifact output.

## Reversibility

Keep current markdown/JSON reports. If artifact consumption fails unexpectedly, ship can temporarily fall back to existing gate readers with a warning.
