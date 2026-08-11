---
feature: state-resilience
layout: tasks
created: 2026-05-01
spec_ref: ".forge/specs/state-resilience/requirements.md"
---

# Tasks

## Task 1: Define default value tables

- [x] 1.1 Add `STATUS_DEFAULTS` constant to `src/state.ts` with defaults for all StatusFile fields
- [x] 1.2 Add `REVIEW_REPORT_DEFAULTS` constant to `src/state.ts` with defaults for all review report fields *(note: consolidated into state.ts rather than review.ts per implementation)*
- [x] 1.3 Add `CONFIG_DEFAULTS` constant to `src/config-store.ts` with defaults for all config fields
- [x] 1.4 Run `npm run typecheck` to verify no type errors

## Task 2: Implement graceful StatusFile parsing

- [x] 2.1 Add `parseStatusFileGraceful(content: string | undefined)` function to `src/state.ts` that returns `{ parsed, warnings }`
- [x] 2.2 Handle cases: undefined content → full defaults; partial frontmatter → per-field defaults; valid content → normal parse
- [x] 2.3 Write unit tests for each case: all fields missing, some fields missing, all fields present, malformed YAML *(in `test/state-resilience.test.ts`)*
- [x] 2.4 Write property test (Property 1): for any subset of fields, result always has all fields populated
- [x] 2.5 Write property test (Property 4): for complete valid input, result matches current parser output

## Task 3: Implement graceful review report parsing

- [x] 3.1 Add `parseReviewReportGraceful` to `src/state.ts` with REVIEW_REPORT_DEFAULTS fallback
- [x] 3.2 Ensure `result` defaults to `"incomplete"` (safe default — blocks ship)
- [x] 3.3 Write unit tests: missing result field, missing count fields, complete report *(in `test/state-resilience.test.ts`)*

## Task 4: Implement graceful config parsing

- [x] 4.1 Add `parseConfigGraceful` to `src/config-store.ts` with CONFIG_DEFAULTS fallback
- [x] 4.2 Handle: missing config.md → full defaults; partial config → per-field defaults
- [x] 4.3 Write unit tests: missing config, partial config, complete config *(in `test/config-store-resilience.test.ts`)*

## Task 5: Harden skill-scheduler for undefined inputs

- [x] 5.1 Update `determineNextSkill` in `src/skill-scheduler.ts` to handle `undefined` for `hasIncompleteTasks` (treat as true — stay in build/build-light/refactor-apply/fix-apply); `reviewResult` and `testPassed` undefined handling was already correct
- [x] 5.2 Add comments documenting the conservative principle: missing data → stay or go back, never skip ahead
- [x] 5.3 Write property test (Property 2): for any SchedulerInput with undefined optional fields, result phase is never later than current phase in the command sequence *(in `test/skill-scheduler-resilience.test.ts`)*
- [x] 5.4 Verify all existing skill-scheduler tests still pass

## Task 6: Implement state reconstruction from git

- [x] 6.1 Extend `src/status-resolver.ts` with `ReconstructedState` interface and `reconstructStateFromGit(forgeFiles: string[])` pure function
- [x] 6.2 Implement inference logic: reviews/ → review phase; progress/ → build phase; plans/ → plan phase; nothing → router
- [x] 6.3 Write property test (Property 3): for any file list containing reviews/, inferred phase is at least "review" *(in `test/status-resolver-resilience.test.ts`)*
- [x] 6.4 Write unit tests for each file combination scenario

## Task 7: Integrate state reconstruction into forge-resume

- [x] 7.1 Update `skills/forge-resume/SKILL.md` Edge Case table to reference state reconstruction via `recoverPhase()` when StatusFile is missing or inconsistent
- [x] 7.2 Add `recoverPhase()` function to `src/resume.ts` that calls `reconstructStateFromGit` when StatusFile parsing returns defaults
- [x] 7.3 Ensure reconstructed state is presented to user for confirmation, NOT auto-written to disk *(enforced via `reconstructed: true` flag in PhaseRecoveryResult)*

## Task 8: Full regression verification

- [x] 8.1 Run `npm run check` — all existing tests pass (3471/3471)
- [x] 8.2 Verify normal flow behavior is unchanged (graceful parsing only activates on missing/malformed data)
- [x] 8.3 Verify skill-scheduler behavior is unchanged for complete inputs
- [x] 8.4 Manually test: delete `.forge/status.md`, run `/forge resume`, verify reconstruction works *(covered by `test/resume-recovery.test.ts` integration tests)*

---

## Completion Summary

**Status**: ✅ All tasks complete

**Implementation evidence**:
- `src/state.ts`: `STATUS_DEFAULTS`, `REVIEW_REPORT_DEFAULTS`, `parseStatusFileGraceful`, `parseReviewReportGraceful`
- `src/config-store.ts`: `CONFIG_DEFAULTS`, `ConfigFields`, `parseConfigGraceful`
- `src/skill-scheduler.ts`: Conservative `hasIncompleteTasks !== false` check for build/build-light/refactor-apply/fix-apply phases
- `src/status-resolver.ts`: `ReconstructedState`, `reconstructStateFromGit`
- `src/resume.ts`: `PhaseRecoveryResult`, `recoverPhase`
- `skills/forge-resume/SKILL.md`: Edge case for StatusFile 缺失或不一致 references `recoverPhase()`

**Test coverage**:
- `test/state-resilience.test.ts` — graceful parsing (Properties 1 & 4)
- `test/config-store-resilience.test.ts` — config graceful parsing
- `test/skill-scheduler-resilience.test.ts` — undefined input handling (Property 2)
- `test/status-resolver-resilience.test.ts` — state reconstruction (Property 3)
- `test/resume-recovery.test.ts` — `recoverPhase` integration
- Shadow-migration tests (`*-schema-shadow.test.ts`) — zod parser path parity
- Benchmark (`test/benchmarks/state-parse.bench.ts`) — performance tracking

**Regression**: `npm run check` passes with 3471 tests. README metrics drift (79→92 modules, 173→207 test files, etc.) is pre-existing project bookkeeping, unrelated to state-resilience.
