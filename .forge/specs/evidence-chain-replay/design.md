---
feature: "evidence-chain-replay"
status: "draft"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Design — evidence-chain-replay

## Overview

Extend `src/feature-dossier.ts` into a timeline/replay layer. Use existing stage scanning for documents and the new artifact index for evidence.

## Current State

`feature-dossier.ts` scans stage files by topic and builds a summary document. It does not model chronology, artifact freshness, trace id, or supersession.

## Proposed Change

Create `src/replay.ts`:

```ts
interface ReplayEntry {
  stage: string;
  timestamp: string | null;
  source: "document" | "artifact" | "inference";
  path?: string;
  artifactId?: string;
  result?: string;
  summary: string;
}
```

## Architecture

| Source | Reader |
|--------|--------|
| `.forge/decisions` | existing dossier scanner |
| `.forge/specs` | existing dossier scanner |
| `.forge/progress` | existing dossier scanner |
| `.forge/reviews` | existing dossier scanner + artifact references |
| `.forge/artifacts` | artifact index query |
| `.forge/ship` | legacy ship records during migration |

## Testing Strategy

- Fixture topic with all stages.
- Fixture topic with missing stages.
- Fixture with superseded artifact.
- Renderer tests for fact/inference labels.

## Rollout

1. Add replay data model.
2. Reuse dossier scanner and add artifact joins.
3. Add renderer.
4. Add command/skill integration.
5. Update docs to describe replay.

## Reversibility

Keep current dossier generation unchanged until replay proves stable.
