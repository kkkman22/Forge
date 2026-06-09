---
status: draft
feature: runtime-worker-context-control
layout: tasks
created: 2026-06-10
spec_ref: ".forge/specs/runtime-worker-context-control/requirements.md"
---
# Tasks

## T-01 Add phase worker summary schema

- **Goal**: Define schema-first bounded worker summaries.
- **Depends On**: []
- **Files**: `src/phase-worker-runtime.ts`, `test/phase-worker-runtime.test.ts`
- **RED**: Summary validation rejects raw oversized fields and trims bounded arrays.
- **GREEN**: Implement normalization and failure summary helpers.
- **Verify Command**: `npx vitest run test/phase-worker-runtime.test.ts`

## T-02 Add Subagent worker backend

- **Goal**: Build and run artifact-first subagent worker requests.
- **Depends On**: [T-01]
- **Files**: `src/phase-worker-runtime.ts`, `test/phase-worker-runtime.test.ts`
- **RED**: Subagent prompt must contain artifact path and bounded summary contract.
- **GREEN**: Implement subagent request builder and executor adapter.
- **Verify Command**: `npx vitest run test/phase-worker-runtime.test.ts`

## T-03 Add CLI/SDK worker backend

- **Goal**: Build deterministic CLI/SDK worker arguments and read summary files.
- **Depends On**: [T-01]
- **Files**: `src/phase-worker-runtime.ts`, `test/phase-worker-runtime.test.ts`
- **RED**: CLI worker must fail when no summary file is produced.
- **GREEN**: Implement command invocation adapter with summary-path contract.
- **Verify Command**: `npx vitest run test/phase-worker-runtime.test.ts`

## T-04 Add runtime configuration drift detection and repair

- **Goal**: Detect source/plugin drift and repair Forge-managed hook shims.
- **Depends On**: []
- **Files**: `src/runtime-config-sync.ts`, `test/runtime-config-sync.test.ts`
- **RED**: Missing compact hooks and stale source shims are reported.
- **GREEN**: Implement drift report and idempotent repair.
- **Verify Command**: `npx vitest run test/runtime-config-sync.test.ts`

## T-05 Add CLI entry scripts and package them

- **Goal**: Provide runtime script entrypoints for source and marketplace use.
- **Depends On**: [T-03, T-04]
- **Files**: `scripts/forge-phase-worker.mjs`, `scripts/forge-sync-runtime.mjs`, `scripts/dist-manifest.json`, `test/plugin-dist/plugin-dist-contract.test.ts`
- **RED**: Plugin dist contract expects runtime scripts in `dist-plugin`.
- **GREEN**: Add scripts with `--help` and update dist manifest.
- **Verify Command**: `npx vitest run test/plugin-dist/plugin-dist-contract.test.ts`

## T-06 Public API and final validation

- **Goal**: Export runtime helpers and run validation.
- **Depends On**: [T-01, T-02, T-03, T-04, T-05]
- **Files**: `src/index.ts`, `test/barrel-file.test.ts`
- **RED**: Barrel export test expects new public helpers.
- **GREEN**: Update barrel exports and count.
- **Verify Command**: `npx vitest run test/phase-worker-runtime.test.ts test/runtime-config-sync.test.ts test/barrel-file.test.ts`
