---
feature: "typed-mcp-capabilities"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
spec_ref: ".tinkerman/specs/typed-mcp-capabilities/requirements.md"
---

# Tasks — typed-mcp-capabilities

## Task Dependency Graph

```json
{
  "waves": [
    { "name": "Tool Schemas", "tasks": ["T-01", "T-02"] },
    { "name": "Capabilities", "tasks": ["T-03", "T-04", "T-05"] },
    { "name": "Migration", "tasks": ["T-06", "T-07"] }
  ],
  "dependencies": {
    "T-02": ["T-01"],
    "T-03": ["T-02"],
    "T-04": ["T-02"],
    "T-05": ["T-02"],
    "T-06": ["T-03", "T-04", "T-05"],
    "T-07": ["T-06"]
  }
}
```

## Task Definitions

#### T-01 Define Capability Schemas

- **Goal**: Add shared MCP capability input/output schemas.
- **TDD Steps**: RED: invalid schema fixtures. GREEN: implement schemas. REFACTOR: shared result types.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/mcp/*.test.ts`

#### T-02 Register Tool Skeletons

- **Goal**: Register typed tools with no behavior changes to existing tools.
- **TDD Steps**: RED: server tool registry test. GREEN: register tools. REFACTOR: common registration helper.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/mcp/server.integration.test.ts`
- **Depends On**: T-01

#### T-03 Implement Dist and Docs Capabilities

- **Goal**: Return structured dist-sync and docs drift results.
- **TDD Steps**: RED: fixture outputs. GREEN: implement wrappers. REFACTOR: avoid parsing human text.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/mcp/*.test.ts test/dist-sync.test.ts test/docs-governance/*.test.ts`
- **Depends On**: T-02

#### T-04 Implement Artifact Query Capability

- **Goal**: Query latest artifacts by topic/kind/commit.
- **TDD Steps**: RED: missing/stale artifact fixtures. GREEN: implement query. REFACTOR: reuse artifact index.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/mcp/*.test.ts test/evidence-artifact*.test.ts`
- **Depends On**: T-02

#### T-05 Implement Review Context Capability

- **Goal**: Return structured review context bundle.
- **TDD Steps**: RED: priority/truncation fixture. GREEN: implement bundle. REFACTOR: reuse existing trimmers.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/mcp/*.test.ts test/context-budget*.test.ts`
- **Depends On**: T-02

#### T-06 Migrate Consumers

- **Goal**: Make doctor/status/review/ship prefer typed capabilities.
- **TDD Steps**: RED: consumer uses legacy path. GREEN: wire typed path. REFACTOR: fallback helper.
- **Verify Command**: `npx tsc --noEmit && npm run check`
- **Depends On**: T-03, T-04, T-05

#### T-07 Add Legacy Deprecation Warnings

- **Goal**: Warn when `forge_exec` is used for checks with typed replacements.
- **TDD Steps**: RED: warning absent. GREEN: emit warnings. REFACTOR: warning allowlist.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/mcp/forge-exec*.test.ts`
- **Depends On**: T-06
