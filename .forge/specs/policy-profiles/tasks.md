---
feature: "policy-profiles"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
spec_ref: ".forge/specs/policy-profiles/requirements.md"
---

# Tasks — policy-profiles

## Task Dependency Graph

```json
{
  "waves": [
    { "name": "Config", "tasks": ["T-01", "T-02"] },
    { "name": "Runtime", "tasks": ["T-03", "T-04"] },
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

#### T-01 Add Profile Config Parsing

- **Goal**: Parse `policy_profile` with safe default `team`.
- **TDD Steps**: RED: missing/invalid config fixtures. GREEN: implement parser. REFACTOR: diagnostics.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/config*.test.ts test/schemas*.test.ts`

#### T-02 Add Workflow Graph Profile Metadata

- **Goal**: Represent profile-specific gate requirements in workflow graph.
- **TDD Steps**: RED: profile graph tests. GREEN: add metadata. REFACTOR: keep default behavior identical.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/workflow-graph*.test.ts`
- **Depends On**: T-01

#### T-03 Display Profile in Doctor/Status

- **Goal**: Show active profile and profile-specific blockers.
- **TDD Steps**: RED: status fixture missing profile. GREEN: wire display. REFACTOR: concise wording.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/doctor*.test.ts test/status*.test.ts`
- **Depends On**: T-02

#### T-04 Enforce Profile-Specific Ship Gates

- **Goal**: Apply artifact/review/mutation requirements by profile.
- **TDD Steps**: RED: enterprise missing artifact passes. GREEN: enforce gate. REFACTOR: shared diagnostics.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/ship-gates.test.ts test/ship*.test.ts`
- **Depends On**: T-03

#### T-05 Document Profile Tradeoffs

- **Goal**: Add docs for solo/team/enterprise profile choice.
- **TDD Steps**: RED: docs link/index checks. GREEN: add docs. REFACTOR: link from init/quick-start.
- **Verify Command**: `npm run docs:check && npm run check`
- **Depends On**: T-04
