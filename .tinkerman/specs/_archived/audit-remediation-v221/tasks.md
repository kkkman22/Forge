---
status: approved
feature: audit-remediation-v221
layout: tasks
created: 2026-04-28
spec_ref: ".tinkerman/specs/audit-remediation-v221/requirements.md"
---

# Implementation Plan: v2.2.1 Audit Remediation

## Overview

This plan implements 25 audit findings across 6 work groups, ordered to build foundational pure-function fixes first (Group D), then layer on runtime validation (A), concurrency/resource management (B), distribution fixes (C), PUA engine enhancements (E), and code quality improvements (F). Each task references specific requirements and design sections. Property-based tests use fast-check; unit tests use Vitest.

## Tasks

- [x] 1. Group D — Pure function logic fixes (Frontmatter, FailureHandler, Orchestrator, Git_Transaction)
  - [x] 1.1 Add `escapeRegExp` helper and apply to all frontmatter field extraction functions
    - Add a private `escapeRegExp(str: string): string` function to `src/frontmatter.ts`
    - Apply escaping to `fieldName` in `extractStringField`, `extractListField`, and `extractNumericField` before constructing `RegExp`
    - _Requirements: 7.1, 7.2_

  - [x] 1.2 Write property test for frontmatter regex safety (Property 3)
    - **Property 3: Frontmatter field extraction regex safety**
    - For any string used as `fieldName` (including regex special characters), calling `extractStringField`, `extractListField`, or `extractNumericField` shall never throw a `SyntaxError` or `RegExp` construction error
    - Extend `test/frontmatter.property.test.ts` with `fc.string()` and `fc.stringOf(fc.constantFrom(...regexSpecialChars))` generators
    - **Validates: Requirements 7.1, 7.2**

  - [x] 1.3 Add lower-bound clamping to `calculateBackoffMs`
    - In `src/failure-handler.ts`, clamp `consecutiveErrors` to `Math.max(1, consecutiveErrors)` before the exponent calculation
    - Ensure return value is always `>= baseMs` for any input
    - _Requirements: 9.1, 9.2_

  - [x] 1.4 Write property test for backoff lower bound invariant (Property 4)
    - **Property 4: Backoff lower bound invariant**
    - For any `consecutiveErrors` (including 0 and negatives) and any positive `baseMs`, `calculateBackoffMs` returns `>= baseMs`
    - Extend `test/failure-handler.property.test.ts` with `fc.integer()` and `fc.integer({ min: 1 })` generators
    - **Validates: Requirements 9.1, 9.2**

  - [x] 1.5 Extend `sanitizeBranchName` to handle all Git-illegal characters and `@{` residual
    - In `src/git-transaction.ts`, ensure `ILLEGAL_BRANCH_CHARS_RE` whitelist excludes `~`, `^`, `*`, `[`, `:`, `?`, `\` (verify current regex already does this)
    - Fix `@{` replacement to also remove residual `{` characters
    - Ensure output never contains `..`, trailing `.lock`, or leading/trailing `.`/`/`/`-`
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 1.6 Write property test for sanitizeBranchName Git legality (Property 5)
    - **Property 5: sanitizeBranchName produces legal Git ref names**
    - For any input string, output does not contain Git-illegal characters (`~`, `^`, `*`, `[`, `:`, `?`, `\`, `..`, `@{`, trailing `.lock`, control chars, spaces) and does not start/end with `.`/`/`/`-`
    - Extend `test/git-transaction.property.test.ts` with `fc.string()` and `fc.stringOf(fc.constantFrom(...gitIllegalChars))` generators
    - **Validates: Requirements 15.1, 15.2, 15.3**

  - [x] 1.7 Add terminal state guards and idle state guard to Orchestrator `transition`
    - In `src/orchestrator.ts`, add early return at top of `transition`: if `status` is `aborted` or `stopped`, return `{ state, effects: [] }`
    - Add early return: if `status` is `idle` and `event.type !== "start"`, return `{ state, effects: [] }`
    - _Requirements: 18.1, 18.2_

  - [x] 1.8 Increment `currentIteration` in `stop_condition_met` handler
    - In `src/orchestrator.ts`, modify the `stop_condition_met` case to set `currentIteration: state.currentIteration + 1` in the returned state
    - _Requirements: 19.1_

  - [x] 1.9 Write property tests for Orchestrator guards and stop_condition_met (Properties 7, 8)
    - **Property 7: Terminal/idle state guards**
    - For any event applied to `aborted`/`stopped` state, transition returns state unchanged with empty effects. For any non-`start` event on `idle`, same behavior.
    - **Property 8: stop_condition_met increments iteration**
    - For any `running` state, `stop_condition_met` produces `currentIteration + 1` and `status === "aborted"`
    - Create `test/orchestrator.property.test.ts` with state generators using `fc.record(...)` and event generators using `fc.oneof(...)`
    - **Validates: Requirements 18.1, 18.2, 19.1**

- [x] 2. Checkpoint — Ensure all tests pass
  - Run `npm test` to verify all 1467+ existing tests still pass along with new property tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Group A — Startup and runtime validation (SdkDriver, Hooks)
  - [x] 3.1 Add hooks validation function and call it during SdkDriver startup
    - Add `validateHooksPresence(cwd: string): { valid: boolean; reason?: string }` to `src/sdk-driver.ts` (or a new helper)
    - Check `hooks/hooks.json` exists and contains `hooks.PreToolUse` array
    - Call at start of `run()` method; on failure, emit `console.warn` with "hooks protection missing" keyword; never block startup
    - Wrap entire check in try/catch to handle unexpected errors gracefully
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Write property test for hooks validation classification (Property 1)
    - **Property 1: Hooks validation correctly classifies JSON structures**
    - For any JSON object, returns `valid: true` iff it contains `hooks.PreToolUse` array; all other structures return `valid: false` with non-empty reason
    - Create `test/hooks-validation.property.test.ts` with `fc.jsonValue()` and `fc.record(...)` generators
    - **Validates: Requirements 1.1**

  - [x] 3.3 Fix notesContent initialization to include branchName
    - Add `branchName: string` to `SdkDriverConfig` interface in `src/sdk-driver.ts`
    - In constructor, initialize `notesDocument` with `branchName: config.branchName`
    - Pass `branchName` from CLI layer (`forge-loop-cli.ts`) through to SdkDriver config
    - Ensure `this.notesContent = formatNotesDocument(this.notesDocument)` produces content matching disk
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 3.4 Write property test for NotesDocument branchName round-trip (Property 2)
    - **Property 2: NotesDocument branchName round-trip preservation**
    - For any valid `NotesDocument` with `branchName`, `formatNotesDocument` output contains the branchName value, and calling it twice produces identical output
    - Create `test/notes-branchname.property.test.ts` with `fc.string()` generators for branchName
    - **Validates: Requirements 5.1, 5.2**

  - [x] 3.5 Enhance PUA state restore error logging with stack traces
    - In `src/sdk-driver.ts`, update all PUA-related catch blocks (state restore, success handling, failure handling, field write, field clear) to use `err instanceof Error ? (err.stack ?? err.message) : String(err)` format
    - _Requirements: 10.1, 10.2_

  - [x] 3.6 Add design-intent comment for `buildPressurePrompt` return value discard
    - In `src/sdk-driver.ts` `handlePuaFailure` method, add comment explaining return value is intentionally discarded: PUA state persists via StatusFile, next iteration rebuilds puaContext from StatusFile
    - Add cross-reference to `executeSkillAwareIteration` PUA state restore logic
    - _Requirements: 16.1, 16.2_

- [x] 4. Group B — Concurrency and resource management (RunManager, CLI)
  - [x] 4.1 Implement file-lock serialization for worktree creation
    - In `src/run-manager.ts`, add file-lock logic using `fs.openSync` with `O_CREAT | O_EXCL` at `.tinkerman/.locks/worktree.lock`
    - Wrap the concurrency check + worktree creation in `setupWorktree` with lock acquire/release
    - On lock timeout, throw error with timeout reason
    - On lock mechanism failure (e.g., directory missing), fall back to lockless mode with `console.warn`
    - Release lock in `finally` block
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 4.2 Add notes backup before worktree deletion
    - In `src/forge-loop-cli.ts`, before `git worktree remove`, copy notes file from worktree to main repo `.tinkerman/runs/<runId>/` directory
    - On backup failure, emit `console.warn` but proceed with worktree deletion
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.3 Add orphan branch cleanup on worktree init failure
    - In `src/run-manager.ts` `setupWorktree` catch block, after removing the worktree, execute `git branch -D <branchName>`
    - On branch deletion failure, include branch name in error message for manual cleanup
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 4.4 Add `--resume <branchName>` CLI option connected to `RunManager.resumeRun`
    - In `src/forge-loop-cli.ts`, add `--resume` option parsing
    - Call `RunManager.resumeRun(branchName, cwd)` to restore run context and notes
    - On missing branch or run directory, output error and exit with non-zero code
    - On success, continue execution from last iteration number
    - _Requirements: 13.1, 13.2, 13.3_

  - [x] 4.5 Write unit tests for file-lock, notes backup, orphan cleanup, and resume
    - Test lock acquire/release/timeout in `test/run-manager.test.ts`
    - Test notes backup success/failure in `test/forge-loop-cli.test.ts`
    - Test orphan branch cleanup in `test/run-manager.test.ts`
    - Test `--resume` with valid/invalid branch in `test/forge-loop-cli.test.ts`
    - _Requirements: 2.1–2.4, 4.1–4.3, 11.1–11.3, 13.1–13.3_

- [x] 5. Checkpoint — Ensure all tests pass
  - Run `npm test` to verify all tests pass after Groups A and B changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Group C — Distribution and frozen protection (build-dist.sh, hooks.json, EffectExecutor)
  - [x] 6.1 Copy `check-frozen.js` to distribution package in build-dist.sh
    - In `scripts/build-dist.sh`, add step to copy `dist/src/check-frozen.js` (and its dependencies) to `${CC_BUNDLE}/dist/src/`
    - Ensure the hooks.json `node forge/dist/src/check-frozen.js` path resolves correctly in the distribution package
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 6.2 Add `FrozenZoneViolation` and `UnexpectedEffectError` error types to EffectExecutor
    - In `src/effect-executor.ts`, define `FrozenZoneViolation` class extending `Error` with `code = "FROZEN_ZONE_VIOLATION"` and `files` property
    - Define `UnexpectedEffectError` class extending `Error` with `code = "UNEXPECTED_EFFECT_ERROR"`
    - Throw `FrozenZoneViolation` from `checkStagedFrozenFiles` when violations are detected (instead of just logging)
    - In SdkDriver catch block, use `instanceof` to distinguish: `FrozenZoneViolation` → terminate loop directly; `UnexpectedEffectError` → trigger `iteration_hard_failure` + backoff
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 6.3 Pass abort signal through to EffectExecutor for effect execution
    - In `src/sdk-driver.ts`, pass `currentAbortController.signal` to `executeEffects` calls
    - In `src/effect-executor.ts`, check `abortSignal?.aborted` before each commit/rollback step
    - If aborted, skip remaining effects and log interruption
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 6.4 Write unit tests for error classification and abort signal propagation
    - Test `FrozenZoneViolation` vs `UnexpectedEffectError` handling in `test/effect-executor.test.ts`
    - Test abort signal skips remaining effects in `test/effect-executor.test.ts`
    - Test distribution package contains `check-frozen.js` in `test/contract.scripts.test.ts`
    - _Requirements: 3.1–3.3, 8.1–8.3, 14.1–14.3_

- [x] 7. Group E — PUA engine and failure handling (SdkDriver, PUA_Engine)
  - [x] 7.1 Add cross-reference comments for circuit breaker and PUA L4 threshold alignment
    - In `src/failure-handler.ts`, add JSDoc comment on `DEFAULT_CIRCUIT_BREAKER_THRESHOLD` explaining relationship with PUA L4 threshold (CB=3 for termination, PUA L4=5 for max pressure), with `@see src/pua-engine.ts determinePressureLevel`
    - In `src/pua-engine.ts`, add comment on L4 threshold explaining relationship with circuit breaker, with `@see src/failure-handler.ts DEFAULT_CIRCUIT_BREAKER_THRESHOLD`
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 7.2 Add PUA failure handling to hard-failure catch paths
    - In `src/sdk-driver.ts` `executeSkillAwareIteration` catch block, call `handlePuaFailure(errorMessage)` when `puaEnabled` is true
    - In `src/sdk-driver.ts` `executeGenericIteration` catch block, call `handlePuaFailure(errorMessage)` when `puaEnabled` is true
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 7.3 Write property test for PUA pressure level monotonicity (Property 6)
    - **Property 6: PUA pressure level monotonicity**
    - For any sequence of increasing `consecutiveFailures` values with constant `stallDetected`, `determinePressureLevel` returns non-decreasing pressure levels
    - Create `test/pua-engine.property.test.ts` with `fc.nat()` generators for consecutiveFailures and `fc.boolean()` for stallDetected
    - **Validates: Requirements 17.3**

- [x] 8. Group F — Code quality and maintainability (Router, Skill_Scheduler, Spec, Plan)
  - [x] 8.1 Add cross-reference comments between Router and Skill_Scheduler command sequences
    - In `src/router.ts` `COMMAND_SEQUENCES`, add comment explaining full sequence includes `decide`/`spec` for complete interactive workflow, with `@see src/skill-scheduler.ts SKILL_COMMAND_SEQUENCES`
    - In `src/skill-scheduler.ts` `SKILL_COMMAND_SEQUENCES`, add comment explaining full sequence omits `decide`/`spec` because Scheduler handles only SKILL execution phases, with `@see src/router.ts COMMAND_SEQUENCES`
    - _Requirements: 20.1, 20.2, 20.3_

  - [x] 8.2 Add `@internal` / `@visibleForTesting` annotations to orphan export functions
    - Add `@internal` or `@visibleForTesting` JSDoc to `getWorkNatureSequenceKey`, `getCommandSequence`, `shouldCommitForPhase` in their respective modules
    - Include note that function is currently test-only and may be connected to production call points in the future
    - _Requirements: 21.1, 21.2_

  - [x] 8.3 Evaluate and implement brownfield standard→full boost or add design decision comment
    - In `src/router.ts` `shouldBrownfieldBoost`, evaluate whether brownfield projects with `hasAuthChanges` or `hasNewService` should boost from standard to full
    - If implementing: add condition to `classifyTier` for standard→full promotion
    - If not implementing: add comment at `shouldBrownfieldBoost` explaining the design decision
    - _Requirements: 22.1, 22.2_

  - [x] 8.4 Write property test for brownfield boost classification (Property 11)
    - **Property 11: Brownfield boost classification**
    - For any `TaskSignals` with brownfield `ProjectContext` where `touchesExistingModules` is true and signals indicate `hasAuthChanges` or `hasNewService`, classified tier is at least `standard`
    - Extend `test/router.property.test.ts` with `fc.record(...)` generators for TaskSignals and ProjectContext
    - **Validates: Requirements 22.1**

  - [x] 8.5 Add validation guards to `confirmSpec` before locking
    - In `src/spec.ts`, modify `confirmSpec` to return `{ success: true; spec: SpecDocument } | { success: false; errors: string[] }`
    - Call `validateTestability(spec.requirements)` before locking; if fails, return error
    - For brownfield specs, call `validateBrownfieldDelta(spec)`; if fails, return error
    - Update all call sites of `confirmSpec` to handle the new return type
    - _Requirements: 23.1, 23.2, 23.3_

  - [x] 8.6 Write property test for confirmSpec validation guard (Property 9)
    - **Property 9: confirmSpec validation guard**
    - For any `SpecDocument` where `validateTestability` returns false, `confirmSpec` returns failure with non-empty errors. For any brownfield spec where `validateBrownfieldDelta` returns false, same behavior.
    - Create `test/spec.property.test.ts` with `fc.record(...)` generators for SpecDocument
    - **Validates: Requirements 23.1, 23.2, 23.3**

  - [x] 8.7 Add spec status check to plan validation and `dependsOn` field to AtomicTask
    - In `src/plan.ts`, add `validateSpecLocked(specStatus: string)` function returning `{ valid: true } | { valid: false; error: string }`
    - Add optional `dependsOn?: number[]` field to `AtomicTask` interface
    - In `validatePlanTasks`, add dependency validation: check all `dependsOn` references point to existing `taskNumber` values
    - _Requirements: 24.1, 24.2, 25.1, 25.2, 25.3_

  - [x] 8.8 Write property test for dependsOn validation (Property 10)
    - **Property 10: dependsOn dependency validation**
    - For any list of `AtomicTask` objects, if any `dependsOn` references a non-existent `taskNumber`, validation returns non-empty errors. If all references are valid, errors are empty.
    - Create `test/plan.property.test.ts` with `fc.array(fc.record(...))` generators for AtomicTask lists
    - **Validates: Requirements 25.2, 25.3**

- [x] 9. Group B supplement — Agent SDK global timeout
  - [x] 9.1 Add configurable global timeout to SdkAgentAdapter
    - In `src/sdk-agent-adapter.ts`, add `globalTimeoutMs?: number` to `SdkAgentAdapterConfig` (default 1,800,000 ms = 30 min)
    - Implement timeout using `AbortController` + `setTimeout`: if SDK call exceeds timeout, abort and throw error containing "timeout" keyword
    - Ensure timeout error propagates as `iteration_hard_failure` in SdkDriver
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 9.2 Write unit tests for agent SDK global timeout
    - Test timeout triggers abort after configured duration in `test/sdk-agent-adapter.test.ts`
    - Test timeout error contains "timeout" keyword
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Run `npm test` to verify all tests pass (existing 1467+ tests plus all new tests)
  - Run Biome lint check to ensure code quality
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major work group
- Property tests validate universal correctness properties from the design document (11 properties total)
- Unit tests validate specific examples, edge cases, and I/O-dependent behavior
- The project uses TypeScript strict mode, Vitest for testing, fast-check for PBT, and Biome for linting
- All changes maintain existing public API signatures except `confirmSpec` (R23) which changes return type
