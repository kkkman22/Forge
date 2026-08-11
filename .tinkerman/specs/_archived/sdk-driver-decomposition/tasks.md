---
status: approved
feature: sdk-driver-decomposition
layout: tasks
created: 2026-05-01
spec_ref: ".tinkerman/specs/sdk-driver-decomposition/requirements.md"
---

# Implementation Plan: SDK Driver Decomposition

## Overview

Decompose `src/sdk-driver.ts` (1438 lines) into 8 focused modules, reducing it to a thin orchestrating shell under 500 lines. Each extraction follows the established pattern from `sdk-status-helpers.ts` and `sdk-quality-helpers.ts`: dependency injection via interfaces, pure functions where possible, and re-exports for backward compatibility. Extractions are ordered by dependency depth — types first, then standalone functions, then utilities, then iteration logic — with type checks and test runs after each step to catch regressions early.

## Tasks

- [x] 1. Extract type definitions to `src/sdk-driver-types.ts`
  - [x] 1.1 Create `src/sdk-driver-types.ts` with `SdkDriverConfig` and `SdkDriverResult` interfaces
    - Move the `SdkDriverConfig` interface and `SdkDriverResult` interface from `sdk-driver.ts` to the new file
    - Add the new `IterationContext`, `SkillIterationContext`, and `IterationResult` interfaces as defined in the design document
    - Include all necessary imports (`RunLimits`, `OrchestratorState`, `NotesDocument`, `AgentInterface`, `OrchestratorEffect`, `TokenUsage`, etc.)
    - The types module must have zero runtime logic — only type definitions and interfaces
    - _Requirements: 1.1, 1.2, 10.1_

  - [x] 1.2 Update `src/sdk-driver.ts` to import from and re-export types
    - Replace the inline `SdkDriverConfig` and `SdkDriverResult` definitions with imports from `./sdk-driver-types.js`
    - Add re-export statements: `export { type SdkDriverConfig, type SdkDriverResult } from "./sdk-driver-types.js"`
    - Verify `src/index.ts` continues to re-export these types via `sdk-driver.js` without changes
    - _Requirements: 1.2, 1.3, 7.1, 7.2, 7.3, 7.4_

  - [x] 1.3 Run type check and tests to verify no regressions
    - Run `tsc --noEmit` to verify type correctness
    - Run `vitest run` to verify all existing tests pass
    - _Requirements: 9.1, 9.3_

- [x] 2. Extract standalone functions to dedicated modules
  - [x] 2.1 Create `src/sdk-sandbox-policy.ts` with `loadSandboxPolicy` function
    - Move the `loadSandboxPolicy` function from `sdk-driver.ts` to the new file
    - Include imports for `existsSync`, `readFileSync`, `join`, `PermissionPolicy`, `validatePolicy`, `buildDefaultPolicy`
    - Import `loadSandboxPolicy` in `sdk-driver.ts` from the new module
    - _Requirements: 2.1, 10.2_

  - [x] 2.2 Create `src/sdk-hooks-validation.ts` with `validateHooksPresence` function
    - Move the `validateHooksPresence` function from `sdk-driver.ts` to the new file
    - Include imports for `existsSync`, `readFileSync`, `join`
    - Add re-export in `sdk-driver.ts`: `export { validateHooksPresence } from "./sdk-hooks-validation.js"`
    - _Requirements: 2.2, 2.4, 2.6, 10.3_

  - [x] 2.3 Create `src/sdk-skill-detection.ts` with `detectSkillAwareMode` function
    - Move the `detectSkillAwareMode` function from `sdk-driver.ts` to the new file
    - Include imports for `existsSync`, `join`
    - Add re-export in `sdk-driver.ts`: `export { detectSkillAwareMode } from "./sdk-skill-detection.js"`
    - _Requirements: 2.3, 2.5, 2.7, 10.4_

  - [x] 2.4 Run type check and tests to verify no regressions
    - Run `tsc --noEmit` to verify type correctness
    - Run `vitest run` to verify all existing tests pass
    - _Requirements: 9.1, 9.3_

- [x] 3. Checkpoint — Verify foundation extractions
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extract commit strategy to `src/sdk-commit-strategy.ts`
  - [x] 4.1 Create `src/sdk-commit-strategy.ts` with commit strategy functions
    - Extract `buildCommitMessageForPhase` as a standalone pure function (takes `phase`, `iterationNumber`, `summary`, `objective` parameters)
    - Extract `applySkillAwareCommitStrategy` as a standalone pure function that returns a `CommitStrategyResult` with the adjusted effects array and optional `stateAdjustment`
    - Import `shouldCommitForPhase` from `./skill-scheduler.js`
    - Define and export the `CommitStrategyResult` interface
    - The caller (`SdkDriver`) applies the `stateAdjustment` to its private `orchestratorState` — the extracted function must not mutate state directly
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 10.7_

  - [x] 4.2 Update `SdkDriver` to delegate to extracted commit strategy
    - Replace the private `buildCommitMessageForPhase` and `applySkillAwareCommitStrategy` methods with calls to the imported functions
    - Pass `this.config.objective` to `buildCommitMessageForPhase` (it was previously accessed via `this.config`)
    - Apply the returned `stateAdjustment` to `this.orchestratorState` in the caller
    - _Requirements: 5.3_

  - [x] 4.3 Run type check and tests to verify no regressions
    - Run `tsc --noEmit` to verify type correctness
    - Run `vitest run` to verify all existing tests pass
    - _Requirements: 9.1, 9.3_

- [x] 5. Extract notes management to `src/sdk-notes-manager.ts`
  - [x] 5.1 Create `src/sdk-notes-manager.ts` with notes management functions
    - Extract `buildIterationEntry` as a standalone pure function
    - Extract `appendAndPersistNotes` as a standalone function that takes the notes document, notes content, entry, notesPath, and optional usage/logger/state/t/runId parameters, and returns `{ notesDocument, notesContent }`
    - Extract `logTokenUsage` as a standalone function
    - Import from `loop-types.js`, `context-accumulator.js`, `run-manager.js`, `logger/index.js`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 10.8_

  - [x] 5.2 Update `SdkDriver` to delegate to extracted notes functions
    - Replace the private `buildIterationEntry`, `appendAndPersistNotes`, and `logTokenUsage` methods with calls to the imported functions
    - Update the caller to apply the returned `{ notesDocument, notesContent }` to `this.notesDocument` and `this.notesContent`
    - _Requirements: 6.3_

  - [x] 5.3 Run type check and tests to verify no regressions
    - Run `tsc --noEmit` to verify type correctness
    - Run `vitest run` to verify all existing tests pass
    - _Requirements: 9.1, 9.3_

- [x] 6. Checkpoint — Verify utility extractions
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Extract generic iteration logic to `src/sdk-generic-iteration.ts`
  - [x] 7.1 Create `src/sdk-generic-iteration.ts` with `executeGenericIteration` function
    - Extract the logic from `SdkDriver.executeGenericIteration()` (~210 lines) into a standalone async function
    - The function accepts an `IterationContext` parameter and returns `Promise<IterationResult>`
    - Use the extracted `buildIterationEntry` and `appendAndPersistNotes` from `sdk-notes-manager.ts`
    - Preserve the exact error handling: try/catch around agent invocation, `FrozenZoneViolation` handling, pre-transition state revert on effect failure
    - Import `transition` from `./orchestrator.js`, `buildIterationPrompt` from `./context-accumulator.js`
    - Include the `ZERO_TOKEN_USAGE` constant (or import it from types)
    - _Requirements: 3.1, 3.2, 10.5_

  - [x] 7.2 Update `SdkDriver` to delegate generic iteration
    - Replace `executeGenericIteration()` method body with: construct `IterationContext`, call extracted function, apply `IterationResult` via `applyIterationResult()`
    - Implement `buildIterationContext()` private method that bundles config, state, collaborators, and callbacks
    - Implement `applyIterationResult()` private method that assigns returned state to private fields
    - _Requirements: 3.3, 3.4_

  - [x] 7.3 Run type check and tests to verify no regressions
    - Run `tsc --noEmit` to verify type correctness
    - Run `vitest run` to verify all existing tests pass
    - _Requirements: 9.1, 9.3_

- [x] 8. Extract skill-aware iteration logic to `src/sdk-skill-iteration.ts`
  - [x] 8.1 Create `src/sdk-skill-iteration.ts` with `executeSkillAwareIteration` function
    - Extract the logic from `SdkDriver.executeSkillAwareIteration()` (~330 lines) into a standalone async function
    - The function accepts a `SkillIterationContext` parameter and returns `Promise<IterationResult>`
    - Use the extracted `buildIterationEntry` and `appendAndPersistNotes` from `sdk-notes-manager.ts`
    - Use the extracted `buildCommitMessageForPhase` and `applySkillAwareCommitStrategy` from `sdk-commit-strategy.ts`
    - Preserve the exact PUA integration: restore context, build prompt with puaContext, handle success/failure paths
    - Preserve quality gate evaluation via `evaluateGateForPhase` from `sdk-quality-helpers.ts`
    - Preserve `reviewFixAttempts` tracking and `loopCompletedNormally` flag in the returned `IterationResult`
    - Import `determineNextSkill`, `shouldCommitForPhase` from `./skill-scheduler.js`, `buildSkillAwarePrompt` from `./context-accumulator.js`
    - _Requirements: 4.1, 4.2, 10.6_

  - [x] 8.2 Update `SdkDriver` to delegate skill-aware iteration
    - Replace `executeSkillAwareIteration()` method body with: construct `SkillIterationContext`, call extracted function, apply `IterationResult`
    - Implement `buildSkillIterationContext()` private method that extends `IterationContext` with statusFileIO, puaStateManager, puaEnabled, reviewFixAttempts
    - Reuse `applyIterationResult()` for applying the result (it already handles `reviewFixAttempts` and `loopCompletedNormally`)
    - _Requirements: 4.3, 4.4_

  - [x] 8.3 Run type check and tests to verify no regressions
    - Run `tsc --noEmit` to verify type correctness
    - Run `vitest run` to verify all existing tests pass
    - _Requirements: 9.1, 9.3_

- [x] 9. Checkpoint — Verify all extractions complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Write property-based tests for correctness properties
  - [x] 10.1 Write property test for commit effect filtering (Property 3)
    - **Property 3: Commit effect filtering for non-commitable phases**
    - Create `test/sdk-commit-strategy.property.test.ts`
    - For any effects array with commit effects and any non-commitable phase with `success=true`, `applySkillAwareCommitStrategy` returns zero commit effects and a `stateAdjustment` decrementing `commitCount`
    - Use fast-check to generate arbitrary effects arrays, phase strings, iteration numbers, and summaries
    - Minimum 100 iterations
    - Tag: `// Feature: sdk-driver-decomposition, Property 3: Commit effect filtering for non-commitable phases`
    - **Validates: Requirements 5.4**

  - [x] 10.2 Write property test for commit message format (Property 4)
    - **Property 4: Commit message format correctness**
    - Add to `test/sdk-commit-strategy.property.test.ts`
    - For any commitable phase, iteration number, and summary, `buildCommitMessageForPhase` returns a string matching `forge(<phase>): <content>`
    - Use fast-check to generate arbitrary phase strings, iteration numbers, and summaries
    - Minimum 100 iterations
    - Tag: `// Feature: sdk-driver-decomposition, Property 4: Commit message format correctness`
    - **Validates: Requirements 5.5**

  - [x] 10.3 Write property test for buildIterationEntry field mapping (Property 5)
    - **Property 5: buildIterationEntry field mapping**
    - Create `test/sdk-notes-manager.property.test.ts`
    - For any iteration number, success flag, and valid `AgentOutput`, `buildIterationEntry` returns an `IterationEntry` with correct field mapping: `number === n`, `success === s`, `summary === o.summary`, `keyChanges === (s ? o.key_changes_made : [])`, `keyLearnings === o.key_learnings`
    - Use fast-check to generate arbitrary iteration numbers, booleans, and AgentOutput objects
    - Minimum 100 iterations
    - Tag: `// Feature: sdk-driver-decomposition, Property 5: buildIterationEntry field mapping`
    - **Validates: Requirements 6.4**

- [x] 11. Final validation and line count verification
  - [x] 11.1 Run full validation suite
    - Run `npm run check` (tsc + biome + vitest + scripts) to verify everything passes
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 11.2 Verify `sdk-driver.ts` is under 500 lines
    - Count lines in `src/sdk-driver.ts` and confirm it is under 500 lines
    - Verify the file retains: `SdkDriver` class, constructor, `run()`, `requestStop()`, `getStopPromise()`, delegation methods, and re-export statements
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 11.3 Verify all 8 extracted modules exist with correct boundaries
    - Confirm `src/sdk-driver-types.ts` contains only type definitions
    - Confirm `src/sdk-sandbox-policy.ts` contains only sandbox policy logic
    - Confirm `src/sdk-hooks-validation.ts` contains only hooks validation logic
    - Confirm `src/sdk-skill-detection.ts` contains only skill detection logic
    - Confirm `src/sdk-commit-strategy.ts` contains only commit strategy logic
    - Confirm `src/sdk-notes-manager.ts` contains only notes management logic
    - Confirm `src/sdk-generic-iteration.ts` contains only generic iteration logic
    - Confirm `src/sdk-skill-iteration.ts` contains only skill-aware iteration logic
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

- [x] 12. Final checkpoint — All done
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each extraction group
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The extraction order (types → standalone → utilities → iteration) follows the dependency DAG to avoid circular imports
- Each extraction step includes a type check + test run to catch regressions immediately
