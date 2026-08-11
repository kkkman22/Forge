---
feature: forge-slimming-followups
layout: tasks
created: 2026-05-14
spec_ref: ".tinkerman/specs/forge-slimming-followups/requirements.md"
---

# Implementation Plan: forge-slimming-followups

## Overview

Closes 4 post-audit gaps from `forge-slimming-plan`: migration guide, command-count drift fix, TypeDoc snapshot refresh, and smoke-channel CI matrix. Execution order follows the design dependency graph: R1 → R2 → R3 → R4. No `src/` modifications, no new runtime dependencies.

## Tasks

- [x] 1. Create migration guide (R1)
  - [x] 1.1 Create `docs/slimming-migration.md`
    - Write the full migration guide covering `/forge recap`, `/forge resume`, `/forge abort`, `/forge learn`, `/forge review`
    - For each command: what changed, delegated Native_Command, minimum version (ref `skills/shared/native-command-matrix.md`), fallback behavior, deprecation lock file path
    - Include Pack_Conditional_Skill section explaining `forge-mutate` visibility and pack activation
    - Include FAQ section
    - **Deliverable**: `docs/slimming-migration.md` exists
    - **Verify**: `test -f docs/slimming-migration.md && grep -q "forge-mutate" docs/slimming-migration.md`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 1.2 Update SKILL.md Deprecation_Notice references
    - Append `迁移指南：docs/slimming-migration.md` to Deprecation_Notice text in:
      - `skills/forge-recap/SKILL.md`
      - `skills/forge-resume/SKILL.md`
      - `skills/forge-learn/SKILL.md`
      - `skills/forge-review/SKILL.md`
    - Also update `references/delegation-adapter.md` if it contains Deprecation_Notice text
    - Must be idempotent (don't duplicate if already present)
    - **Deliverable**: 4 SKILL.md files updated with guide path
    - **Verify**: `grep -l "docs/slimming-migration.md" skills/forge-recap/SKILL.md skills/forge-resume/SKILL.md skills/forge-learn/SKILL.md skills/forge-review/SKILL.md`
    - _Requirements: 1.4_

- [x] 2. Fix command count "28" drift (R2)
  - [x] 2.1 Fix command count in non-historical files
    - Replace "28" with current SST value (22) in:
      - `.claude-plugin/marketplace.json` → `plugins[0].description`
      - `ROADMAP.md` → line referencing "28 个 slash command"
      - `CHANGELOG.md` → line referencing "28 个 slash command wrappers"
    - **Deliverable**: Three files updated with correct count
    - **Verify**: `! grep -n "28.*slash command" ROADMAP.md CHANGELOG.md .claude-plugin/marketplace.json`
    - _Requirements: 2.1, 2.3_

  - [x] 2.2 Add historical annotation to decision file
    - In `.tinkerman/decisions/2026-05-12-plugin-distribution.md`, keep original "28" but append parenthetical: `(historical: count at time of writing was 28; current SST={FORGE_COMMAND_COUNT})`
    - **Deliverable**: Decision file annotated
    - **Verify**: `grep -q "(historical:" .tinkerman/decisions/2026-05-12-plugin-distribution.md`
    - _Requirements: 2.1, 2.2_

  - [x] 2.3 Extend `scripts/gen-plugin-commands.mjs --verify-count`
    - Add scan targets: `ROADMAP.md`, `CHANGELOG.md`, `.tinkerman/decisions/*.md`
    - Pattern: `/(\d+)\s*(?:个\s*)?(?:slash\s*)?command/gi` variants
    - For `.tinkerman/decisions/*.md`: skip lines containing `(historical:` — those are compliant
    - Exit non-zero and report file + line on drift
    - **Deliverable**: `scripts/gen-plugin-commands.mjs` extended
    - **Verify**: `node scripts/gen-plugin-commands.mjs --verify-count` exits 0
    - _Requirements: 2.4, 2.5_

  - [x] 2.4 Wire `--verify-count` into `plugin-validate` CI job
    - Add step to `.github/workflows/ci.yml` `plugin-validate` job: `node scripts/gen-plugin-commands.mjs --verify-count`
    - **Deliverable**: CI job updated
    - **Verify**: `grep -q "verify-count" .github/workflows/ci.yml`
    - _Requirements: 2.6_

- [x] 3. Checkpoint — R1+R2 complete
  - Ensure all tests pass (`npm run test`), ask the user if questions arise.

- [x] 4. TypeDoc regeneration + CI drift guard (R3)
  - [x] 4.1 Regenerate `docs/api/` from current source
    - Run `npm run docs` to regenerate TypeDoc output
    - Confirm `docs/api/media/ROADMAP.md` does NOT contain ⏳ character
    - **Deliverable**: `docs/api/` refreshed, no stale markers
    - **Verify**: `npm run docs && ! grep -r "⏳" docs/api/media/ROADMAP.md`
    - _Requirements: 3.1, 3.2_

  - [x] 4.2 Add `git diff` assertion to CI `check` job
    - Extend the existing "Verify docs generation" step in `.github/workflows/ci.yml` to assert `git diff --stat docs/api/` is empty after `npm run docs`
    - If non-empty: print diff stat, emit `::error::`, exit 1
    - **Deliverable**: CI step updated with drift assertion
    - **Verify**: `grep -A5 "Verify docs generation" .github/workflows/ci.yml | grep -q "git diff"`
    - _Requirements: 3.3_

- [x] 5. Smoke channel matrix workflow (R4)
  - [x] 5.1 Create `scripts/smoke-install.sh`
    - Accept channel argument: `clone`, `dist`, `plugin`
    - `clone`: no-op (already checked out)
    - `dist`: run `bash scripts/build-dist.sh`, set working dir to `dist/`
    - `plugin`: run `bash scripts/build-dist.sh`, set working dir to `dist-plugin/`
    - **Deliverable**: `scripts/smoke-install.sh` created and executable
    - **Verify**: `test -x scripts/smoke-install.sh && bash scripts/smoke-install.sh clone`
    - _Requirements: 4.2a_

  - [x] 5.2 Create `scripts/smoke-activate-pack.sh`
    - Accept pack argument: `pms` (or others in future)
    - Enable the specified pack's feature flags so `gen-plugin-commands.mjs` registers conditional skills
    - **Deliverable**: `scripts/smoke-activate-pack.sh` created and executable
    - **Verify**: `test -x scripts/smoke-activate-pack.sh`
    - _Requirements: 4.2b_

  - [x] 5.3 Create `.github/workflows/smoke-channels.yml`
    - Matrix: `channel ∈ {clone, dist, plugin}` × `pack ∈ {none, pms}` (6 cells)
    - Triggers: `push` to `main`, `pull_request` to `main`
    - Steps: checkout → setup-node 22 → npm ci → smoke-install → activate-pack → verify status → assert forge-mutate visibility → exercise delegation adapter version detection
    - `fail-fast: false`
    - Error messages include `[channel×pack]` identifier
    - No new runtime dependencies (use existing actions + scripts)
    - **Deliverable**: `.github/workflows/smoke-channels.yml` created
    - **Verify**: `cat .github/workflows/smoke-channels.yml | grep -q "matrix:" && grep -q "fail-fast: false" .github/workflows/smoke-channels.yml`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 6. Final checkpoint — all green
  - Run `npm run test` to confirm PBT stays green (R7)
  - Run `node scripts/gen-plugin-commands.mjs --verify-count` to confirm no drift (R2)
  - Ensure no `src/` files modified (R5, R6)
  - Ensure no new `dependencies` in `package.json` (R5)
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- No tasks are marked optional — this spec has no PBT (design explicitly states PBT not applicable)
- Cross-cutting requirements R5–R8 are verified at checkpoints rather than as standalone tasks
- Tasks reference specific sub-requirements (e.g., 2.4 = R2 acceptance criterion 4)
- Each task includes a verification command for quick confirmation
- The `--verify-count` extension (2.3) is the key automation that prevents future drift

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3"] }
  ]
}
```
