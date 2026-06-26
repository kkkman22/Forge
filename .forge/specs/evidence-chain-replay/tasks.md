---
feature: "evidence-chain-replay"
status: draft
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
spec_ref: ".forge/specs/evidence-chain-replay/requirements.md"
---

# Tasks — evidence-chain-replay

## Task Dependency Graph

```json
{
  "waves": [
    { "name": "Core Replay", "tasks": ["T-01", "T-02"] },
    { "name": "Rendering", "tasks": ["T-03", "T-04"] },
    { "name": "Docs", "tasks": ["T-05"] }
  ],
  "dependencies": {
    "T-02": ["T-01"],
    "T-03": ["T-02"],
    "T-04": ["T-03"],
    "T-05": ["T-04"]
  }
}
```

## Task Definitions

#### T-01 Add Replay Model

- **Goal**: Define timeline entry and replay result types.
- **TDD Steps**: RED: replay fixture tests. GREEN: implement model. REFACTOR: align with dossier types.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/replay*.test.ts`

#### T-02 Join Dossier and Artifacts

- **Goal**: Build replay timeline from stage files and artifact index.
- **TDD Steps**: RED: all-stage fixture fails. GREEN: implement joins. REFACTOR: sort/timestamp helpers.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/replay*.test.ts test/feature-dossier.test.ts`
- **Depends On**: T-01

#### T-03 Render Replay Output

- **Goal**: Render concise terminal output and markdown dossier extension.
- **TDD Steps**: RED: snapshot tests. GREEN: implement renderer. REFACTOR: shorten summaries.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/replay*.test.ts`
- **Depends On**: T-02

#### T-04 Add Command Integration

- **Goal**: Expose replay through a command or existing recap/dossier flow.
- **TDD Steps**: RED: command registry parity test. GREEN: wire command. REFACTOR: reuse existing dispatcher patterns.
- **Verify Command**: `npx tsc --noEmit && npm run check`
- **Depends On**: T-03

#### T-05 Update Documentation

- **Goal**: Document replay as evidence-chain inspection.
- **TDD Steps**: RED: docs index/drift test. GREEN: update docs. REFACTOR: link from status/ship docs.
- **Verify Command**: `npm run docs:check`
- **Depends On**: T-04
