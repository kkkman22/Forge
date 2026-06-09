---
feature: "user-task-flow-docs"
status: "draft"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
spec_ref: ".forge/specs/user-task-flow-docs/requirements.md"
---

# Tasks — user-task-flow-docs

## Task Dependency Graph

```json
{
  "waves": [
    { "name": "Structure", "tasks": ["T-01", "T-02"] },
    { "name": "Content", "tasks": ["T-03", "T-04"] },
    { "name": "Governance", "tasks": ["T-05"] }
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

#### T-01 Add Flow Doc Structure

- **Goal**: Add docs structure for task-flow pages.
- **TDD Steps**: RED: docs structure test. GREEN: add pages. REFACTOR: normalize frontmatter.
- **Verify Command**: `npm run docs:check`

#### T-02 Update README Navigation

- **Goal**: Make README task-flow first.
- **TDD Steps**: RED: README metrics/link test. GREEN: update README. REFACTOR: preserve generated metrics.
- **Verify Command**: `bash scripts/check-readme-metrics.sh && npm run docs:check`
- **Depends On**: T-01

#### T-03 Write Chinese Flow Pages

- **Goal**: Author task-flow docs for bugfix, feature, vague requirement, and ship readiness.
- **TDD Steps**: RED: link/index tests. GREEN: write pages. REFACTOR: remove command-first duplication.
- **Verify Command**: `npm run docs:check`
- **Depends On**: T-02

#### T-04 Add English Mirrors

- **Goal**: Add bilingual counterparts.
- **TDD Steps**: RED: bilingual check fails. GREEN: add pages. REFACTOR: align headings.
- **Verify Command**: `npm run docs:check`
- **Depends On**: T-03

#### T-05 Update Docs Index and SSOT

- **Goal**: Ensure docs index and generated blocks remain clean.
- **TDD Steps**: RED: stale index. GREEN: rebuild index/embeds. REFACTOR: verify no manual generated drift.
- **Verify Command**: `npm run docs:check && npm run check`
- **Depends On**: T-04
