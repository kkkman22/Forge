---
feature: "immutable-evidence-artifacts"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
spec_ref: ".tinkerman/specs/immutable-evidence-artifacts/requirements.md"
---

# Tasks — immutable-evidence-artifacts

## Overview

Build artifact infrastructure first, then wire it into ship, review, test, and verify.

## Task Dependency Graph

```json
{
  "waves": [
    { "name": "Core", "tasks": ["T-01", "T-02"] },
    { "name": "Gate Integration", "tasks": ["T-03", "T-04", "T-05"] },
    { "name": "Verify and Docs", "tasks": ["T-06", "T-07"] }
  ],
  "dependencies": {
    "T-02": ["T-01"],
    "T-03": ["T-02"],
    "T-04": ["T-02"],
    "T-05": ["T-03", "T-04"],
    "T-06": ["T-02"],
    "T-07": ["T-05", "T-06"]
  }
}
```

## Task Definitions

#### T-01 Define Artifact Schema

- **Goal**: Add schema and validation for evidence artifacts.
- **TDD Steps**: RED: invalid fixtures fail. GREEN: implement parser/validator. REFACTOR: stabilize diagnostics.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/evidence-artifact*.test.ts`
- **Definition of Done**: All required fields and enum values are validated.

#### T-02 Implement Immutable Writer and Index

- **Goal**: Write artifacts without overwrite and append index records.
- **TDD Steps**: RED: duplicate id overwrite test. GREEN: implement writer. REFACTOR: isolate filesystem adapter.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/evidence-artifact*.test.ts`
- **Definition of Done**: Existing artifact files cannot be overwritten.
- **Depends On**: T-01

#### T-03 Wrap Ship Gate Evidence

- **Goal**: Convert ship gate reports into `ship_gate` artifacts.
- **TDD Steps**: RED: ship report writes artifact test. GREEN: wire writer. REFACTOR: keep current JSON view.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/ship-gates.test.ts test/ship*.test.ts`
- **Depends On**: T-02

#### T-04 Produce Review and Test Artifacts

- **Goal**: Add artifact references to review and test outputs.
- **TDD Steps**: RED: review/test output cites artifact id. GREEN: integrate writer. REFACTOR: shared helpers.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/review*.test.ts test/ship-freshness.unit.test.ts`
- **Depends On**: T-02

#### T-05 Enforce Freshness in Ship

- **Goal**: Make ship gate consume artifact index freshness.
- **TDD Steps**: RED: stale artifact blocks ship. GREEN: implement freshness reader. REFACTOR: clarify diagnostics.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/ship-freshness.unit.test.ts test/ship-gates.test.ts`
- **Depends On**: T-03, T-04

#### T-06 Migrate Verify Verdicts

- **Goal**: Make `runVerify` write artifact-backed verdicts.
- **TDD Steps**: RED: verdict lacks artifact id. GREEN: write verify artifact. REFACTOR: share result enum.
- **Verify Command**: `npx tsc --noEmit && npx vitest run test/verify*.test.ts`
- **Depends On**: T-02

#### T-07 Add Artifact Drift Tests

- **Goal**: Prevent pass claims without artifact references.
- **TDD Steps**: RED: fixture with unsupported pass claim fails. GREEN: add linter. REFACTOR: scoped allowlist.
- **Verify Command**: `npx tsc --noEmit && npm run check`
- **Depends On**: T-05, T-06
- **裁决(2026-06-30 gap-remediate-0630 T-06 PoC):函数已交付,门禁接入撤回**。`validateArtifactBackedVerdict`(`src/evidence-artifact.ts:245`)已实现 + 有单元测试(`test/evidence-artifact.test.ts`),作为 standalone 工具按需调用。**不接入 `npm run check`**,理由:PoC 实测全库无 verdict 声明文件(`.tinkerman/artifacts/` 不存在,ArtifactBackedVerdict 仅在 spec 文档提及),接入 check 链 = 扫描空集,价值为零却增加链复杂度。DoD 修正:从"接入 check 链"改为"提供 standalone 函数 + 单测,待未来出现 verdict 声明文件再评估接入"。撤回记录见 `gap-remediate-0630` T-06。
