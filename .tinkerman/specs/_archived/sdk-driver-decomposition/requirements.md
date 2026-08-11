---
status: archived
archived_reason: "SDK driver 系统分解完成后在退役波次中整体移除 (a77f8394)"
archived_replacement: "已退役，无替代"
feature: sdk-driver-decomposition
layout: requirements
created: 2026-05-01
tier: standard
---
# Requirements Document

## Introduction

Decompose `src/sdk-driver.ts` (1438 lines, 15+ imports) into smaller, focused modules while preserving all existing behavior and public API contracts. The goal is to reduce the main file to under 500 lines by extracting cohesive method groups into dedicated modules, with `sdk-driver.ts` remaining as a thin orchestrating shell that delegates to extracted modules. This is a pure refactoring — zero behavioral changes, all 16 existing test files must continue to pass without modification.

## Glossary

- **SdkDriver**: The core autonomous loop driver class exported from `src/sdk-driver.ts` that bridges the pure-function state machine with real I/O.
- **Barrel_File**: A module (`src/sdk-driver.ts`) that re-exports symbols from extracted sub-modules to maintain backward-compatible import paths.
- **Extracted_Module**: A new TypeScript file created by moving functions or method logic out of `sdk-driver.ts` into a dedicated, focused module.
- **Re_Export**: A TypeScript `export { ... } from "./module.js"` statement that makes symbols available from their original import path after extraction.
- **Public_API**: The set of exports from `src/index.ts` — specifically `SdkDriver`, `SdkDriverConfig`, and `SdkDriverResult`.
- **Test_Import_Path**: The import specifier used by test files to reference symbols (e.g., `../src/sdk-driver.js`).
- **Validation_Command**: The `npm run check` command that runs `tsc --noEmit && biome check && vitest run && scripts`.
- **Generic_Iteration**: The non-skill-aware iteration logic in `executeGenericIteration()` (~210 lines).
- **Skill_Aware_Iteration**: The skill-aware iteration logic in `executeSkillAwareIteration()` (~330 lines).
- **Commit_Strategy**: The phase-specific commit message building and commit effect filtering logic (~90 lines).
- **Notes_Management**: The iteration entry construction, notes persistence, and token usage logging logic (~70 lines).
- **Standalone_Function**: A function defined at module scope (not as a class method) in `sdk-driver.ts` — specifically `loadSandboxPolicy`, `validateHooksPresence`, and `detectSkillAwareMode`.

## Requirements

### Requirement 1: Extract Type Definitions to a Dedicated Types Module

**User Story:** As a developer, I want `SdkDriverConfig` and `SdkDriverResult` interfaces in a dedicated types module, so that other extracted modules can import them without circular dependencies.

#### Acceptance Criteria

1. THE Extracted_Module `src/sdk-driver-types.ts` SHALL contain the `SdkDriverConfig` interface and the `SdkDriverResult` interface.
2. THE Barrel_File `src/sdk-driver.ts` SHALL re-export `SdkDriverConfig` and `SdkDriverResult` from `src/sdk-driver-types.ts`.
3. WHEN a test file imports `SdkDriverConfig` or `SdkDriverResult` from `../src/sdk-driver.js`, THE import SHALL resolve to the same type definition as before extraction.

### Requirement 2: Extract Standalone Functions to Dedicated Modules

**User Story:** As a developer, I want standalone functions extracted into focused modules, so that each module has a single responsibility and the main driver file is smaller.

#### Acceptance Criteria

1. THE Extracted_Module `src/sdk-sandbox-policy.ts` SHALL contain the `loadSandboxPolicy` function.
2. THE Extracted_Module `src/sdk-hooks-validation.ts` SHALL contain the `validateHooksPresence` function.
3. THE Extracted_Module `src/sdk-skill-detection.ts` SHALL contain the `detectSkillAwareMode` function.
4. THE Barrel_File `src/sdk-driver.ts` SHALL re-export `validateHooksPresence` from `src/sdk-hooks-validation.ts`.
5. THE Barrel_File `src/sdk-driver.ts` SHALL re-export `detectSkillAwareMode` from `src/sdk-skill-detection.ts`.
6. WHEN a test file imports `validateHooksPresence` from `../src/sdk-driver.js`, THE import SHALL resolve to the same function as before extraction.
7. WHEN a test file imports `detectSkillAwareMode` from `../src/sdk-driver.js`, THE import SHALL resolve to the same function as before extraction.

### Requirement 3: Extract Generic Iteration Logic

**User Story:** As a developer, I want the generic (non-skill-aware) iteration logic in a separate module, so that the SdkDriver class focuses on loop orchestration rather than iteration details.

#### Acceptance Criteria

1. THE Extracted_Module `src/sdk-generic-iteration.ts` SHALL contain the logic currently in `SdkDriver.executeGenericIteration()`.
2. THE Extracted_Module SHALL export a function that accepts the dependencies it needs (orchestrator state, config, agent adapter, effect executor, logger, performance tracker, notes state) and returns the updated state.
3. THE SdkDriver class SHALL delegate to the extracted function when `skillAware` is `false`.
4. WHEN the extracted function executes an iteration, THE SdkDriver SHALL produce identical orchestrator state transitions as the original inline method.

### Requirement 4: Extract Skill-Aware Iteration Logic

**User Story:** As a developer, I want the skill-aware iteration logic in a separate module, so that the complex PUA integration and skill scheduling code is isolated from the main driver.

#### Acceptance Criteria

1. THE Extracted_Module `src/sdk-skill-iteration.ts` SHALL contain the logic currently in `SdkDriver.executeSkillAwareIteration()`.
2. THE Extracted_Module SHALL export a function that accepts the dependencies it needs (orchestrator state, config, agent adapter, effect executor, logger, performance tracker, notes state, PUA state manager, status file IO) and returns the updated state.
3. THE SdkDriver class SHALL delegate to the extracted function when `skillAware` is `true`.
4. WHEN the extracted function executes a skill-aware iteration, THE SdkDriver SHALL produce identical orchestrator state transitions, quality gate evaluations, and PUA state changes as the original inline method.

### Requirement 5: Extract Commit Strategy Logic

**User Story:** As a developer, I want the commit strategy logic in a separate module, so that phase-specific commit message building and commit effect filtering are independently testable.

#### Acceptance Criteria

1. THE Extracted_Module `src/sdk-commit-strategy.ts` SHALL contain the `buildCommitMessageForPhase` function and the `applySkillAwareCommitStrategy` function.
2. THE Extracted_Module SHALL export pure functions that accept the phase, iteration number, summary, success flag, and effects array as parameters.
3. THE SdkDriver class SHALL delegate commit strategy decisions to the extracted functions.
4. WHEN the extracted `applySkillAwareCommitStrategy` function processes effects for a non-commitable phase, THE function SHALL remove commit effects and return the adjusted effects array.
5. WHEN the extracted `buildCommitMessageForPhase` function receives a `"build"` phase, THE function SHALL return a message in the format `forge(build): <summary>`.

### Requirement 6: Extract Notes Management Logic

**User Story:** As a developer, I want the notes management logic in a separate module, so that iteration entry construction, notes persistence, and token logging are cohesive and isolated.

#### Acceptance Criteria

1. THE Extracted_Module `src/sdk-notes-manager.ts` SHALL contain the `buildIterationEntry`, `appendAndPersistNotes`, and `logTokenUsage` logic.
2. THE Extracted_Module SHALL export functions that accept the notes document, notes content, config, logger, and orchestrator state as parameters.
3. THE SdkDriver class SHALL delegate notes operations to the extracted functions.
4. WHEN the extracted `buildIterationEntry` function receives an iteration number, success flag, and agent output, THE function SHALL return an `IterationEntry` with the same field mapping as the original method.

### Requirement 7: Maintain Backward-Compatible Import Paths

**User Story:** As a developer, I want all existing import paths to continue working after the refactoring, so that no test files or downstream consumers need modification.

#### Acceptance Criteria

1. THE Barrel_File `src/sdk-driver.ts` SHALL re-export all symbols that were previously exported directly: `SdkDriver`, `SdkDriverConfig`, `SdkDriverResult`, `validateHooksPresence`, and `detectSkillAwareMode`.
2. THE Public_API file `src/index.ts` SHALL remain unchanged — no import paths or exported symbols modified.
3. WHEN any of the 16 test files imports from `../src/sdk-driver.js`, THE import SHALL resolve successfully with identical type signatures.
4. FOR ALL re-exported symbols, THE TypeScript compiler SHALL report zero type errors when compiling the project with `tsc --noEmit`.

### Requirement 8: Reduce Main File to Under 500 Lines

**User Story:** As a developer, I want `sdk-driver.ts` reduced to under 500 lines, so that the file is easy to navigate and understand as a thin orchestrating shell.

#### Acceptance Criteria

1. THE Barrel_File `src/sdk-driver.ts` SHALL contain fewer than 500 lines after all extractions are complete.
2. THE Barrel_File SHALL retain the `SdkDriver` class definition with constructor, `run()`, `requestStop()`, `getStopPromise()`, and delegation methods.
3. THE Barrel_File SHALL contain re-export statements for all symbols that were previously exported.
4. WHILE the SdkDriver class delegates to extracted modules, THE class SHALL maintain its existing constructor signature and public method signatures.

### Requirement 9: Preserve Zero Behavioral Changes

**User Story:** As a developer, I want the refactoring to produce zero behavioral changes, so that the system continues to work identically after decomposition.

#### Acceptance Criteria

1. THE Validation_Command `npm run check` SHALL pass with zero errors after all extractions are complete.
2. WHEN the full test suite runs via `vitest run`, THE test suite SHALL report the same number of passing tests as before the refactoring.
3. THE TypeScript compiler SHALL report zero type errors when compiling with `tsc --noEmit`.
4. THE Biome linter SHALL report zero errors when checking with `biome check src/ test/`.
5. IF any Extracted_Module introduces a new dependency not present in the original `sdk-driver.ts`, THEN THE Extracted_Module SHALL import that dependency explicitly rather than relying on transitive imports.

### Requirement 10: Maintain Module Cohesion in Extracted Files

**User Story:** As a developer, I want each extracted module to have clear boundaries and a single responsibility, so that the codebase is easier to maintain.

#### Acceptance Criteria

1. THE Extracted_Module `src/sdk-driver-types.ts` SHALL contain only type definitions (interfaces) and no runtime logic.
2. THE Extracted_Module `src/sdk-sandbox-policy.ts` SHALL contain only sandbox policy loading logic and its direct dependencies.
3. THE Extracted_Module `src/sdk-hooks-validation.ts` SHALL contain only hooks validation logic and its direct dependencies.
4. THE Extracted_Module `src/sdk-skill-detection.ts` SHALL contain only skill-aware mode detection logic and its direct dependencies.
5. THE Extracted_Module `src/sdk-generic-iteration.ts` SHALL contain only generic iteration execution logic.
6. THE Extracted_Module `src/sdk-skill-iteration.ts` SHALL contain only skill-aware iteration execution logic.
7. THE Extracted_Module `src/sdk-commit-strategy.ts` SHALL contain only commit strategy logic (message building and effect filtering).
8. THE Extracted_Module `src/sdk-notes-manager.ts` SHALL contain only notes management logic (entry building, persistence, token logging).
