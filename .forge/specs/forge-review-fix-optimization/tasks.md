---
feature: forge-review-fix-optimization
layout: tasks
created: 2026-04-29
spec_ref: ".forge/specs/forge-review-fix-optimization/requirements.md"
---

# Implementation Plan: forge-review-fix-optimization

## Overview

This plan implements six systemic improvements to the Forge review → fix → re-review → ship cycle. The implementation follows the design's fix-before-extend strategy: P1 bugs in `context-budget.ts` are fixed first, then new modules are built bottom-up (no upstream dependencies first), and finally existing modules are extended and SKILL documents updated.

All tasks follow TDD discipline (RED → GREEN → REFACTOR). Property-based tests use `fast-check` with minimum 100 iterations. CI validation: `npm run check`.

## Tasks

- [x] 1. Fix P1 bugs in context-budget.ts (fix-before-extend)
  - [x] 1.1 Add runtime enum validation helpers (`isValidSeverity`, `isValidSubagentStatus`) and integrate into deserializers
    - Add `isValidSeverity` and `isValidSubagentStatus` functions to `src/context-budget.ts`
    - Update `deserializeReviewSummary` to reject findings with invalid severity values
    - Update `deserializeSubagentSummary` to default to `"DONE"` for invalid status values
    - _Requirements: 15.4_

  - [x]* 1.2 Write property test for runtime enum validation (Property 26)
    - **Property 26: Runtime enum validation in deserializers**
    - Test that invalid severity values are excluded from deserialized review findings
    - Test that invalid subagent status values default to `"DONE"`
    - Add to `test/context-budget.property.test.ts`
    - **Validates: Requirements 15.4**

  - [x] 1.3 Fix `serializeExploreResult` error/empty passthrough
    - Harden the empty-object case in `serializeExploreResult` to consistently return the passthrough message
    - Ensure string error inputs are returned without transformation
    - _Requirements: 1.5, 15.1_

  - [x]* 1.4 Write property test for explore error passthrough (Property 2)
    - **Property 2: Explore error passthrough identity**
    - Test that non-empty strings pass through unchanged, null/undefined return standard message
    - Add to `test/context-budget.property.test.ts`
    - **Validates: Requirements 1.5, 15.1**

  - [x] 1.5 Fix `deserializeTestOutput` to retain raw output on parse failure
    - Add `rawOutput` field to `TestOutputSummary` interface
    - Update `deserializeTestOutput` to set `rawOutput` to the original input when `parseFailed` is true
    - _Requirements: 3.5, 15.2_

  - [x]* 1.6 Write property test for test output parse failure retention (Property 5)
    - **Property 5: Test output parse failure retention**
    - Test that unrecognized format strings set `parseFailed: true` and `rawOutput` to original input
    - Add to `test/context-budget.property.test.ts`
    - **Validates: Requirements 3.5, 15.2**

  - [x]* 1.7 Add vitest format compatibility unit tests
    - Add tests with actual vitest output format samples to `test/context-budget-passthrough.test.ts`
    - _Requirements: 15.3_

- [x] 2. Checkpoint — Verify P1 fixes pass CI
  - Run `npm run check` and ensure all tests pass
  - Ensure all existing context-budget property tests still pass (Properties 1, 3, 4, 6, 7, 8, 9, 10, 11)
  - Ask the user if questions arise

- [x] 3. Implement backlog module (`src/backlog.ts`)
  - [x] 3.1 Create `src/backlog.ts` with types and core functions
    - Define `BacklogEntry` interface
    - Implement `parseBacklog`, `serializeBacklog`, `generateBacklogHeader`
    - Implement `appendToBacklog` with deduplication by ID
    - Implement `findOverlappingEntries` for file path matching
    - Implement `resolveEntry` to mark entries as resolved
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x]* 3.2 Write property test for backlog append with deduplication (Property 12)
    - **Property 12: Backlog append with deduplication and tagging**
    - Test that new entries are added, duplicates are skipped, all entries have `capturedDate` and `originTask`, originals are preserved
    - Add to `test/backlog.property.test.ts`
    - **Validates: Requirements 6.1, 6.2, 6.4**

  - [x]* 3.3 Write property test for backlog overlap detection (Property 13)
    - **Property 13: Backlog overlap detection**
    - Test that `findOverlappingEntries` returns exactly entries whose `filePath` matches affected files
    - Add to `test/backlog.property.test.ts`
    - **Validates: Requirements 6.3**

  - [x]* 3.4 Write property test for backlog resolve (Property 14)
    - **Property 14: Backlog resolve marks entry**
    - Test that `resolveEntry` sets `resolved`, `resolvedBy`, `resolvedDate` while preserving other fields
    - Add to `test/backlog.property.test.ts`
    - **Validates: Requirements 6.5**

  - [x]* 3.5 Write property test for backlog round-trip (Property 15)
    - **Property 15: Backlog round-trip**
    - Test that `serializeBacklog` → `parseBacklog` produces equivalent entries
    - Add to `test/backlog.property.test.ts`
    - **Validates: Requirements 6.1**

  - [x]* 3.6 Write unit tests for backlog edge cases
    - Test header generation (R6.6), empty backlog parsing, legacy format handling
    - Add to `test/backlog.test.ts`
    - _Requirements: 6.6_

- [x] 4. Implement fix-checklist module (`src/fix-checklist.ts`)
  - [x] 4.1 Create `src/fix-checklist.ts` with types and core functions
    - Define `ChecklistStatus`, `ChecklistEntry`, `VALID_TRANSITIONS`
    - Implement `isValidTransition`, `createChecklist`, `updateEntryStatus`
    - Implement `allEntriesVerified`, `parseChecklist`, `serializeChecklist`
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

  - [x]* 4.2 Write property test for checklist creation filter (Property 16)
    - **Property 16: Checklist creation filters to P0/P1**
    - Test that mixed-severity findings produce only P0/P1 entries with status `"unfixed"`
    - Add to `test/fix-checklist.property.test.ts`
    - **Validates: Requirements 10.1**

  - [x]* 4.3 Write property test for checklist status transitions (Property 17)
    - **Property 17: Checklist status transition validity**
    - Test that `isValidTransition` returns true iff `next` is in `VALID_TRANSITIONS[current]`
    - Add to `test/fix-checklist.property.test.ts`
    - **Validates: Requirements 10.2, 10.5**

  - [x]* 4.4 Write property test for checklist round-trip (Property 18)
    - **Property 18: Checklist round-trip**
    - Test that `serializeChecklist` → `parseChecklist` produces equivalent entries
    - Add to `test/fix-checklist.property.test.ts`
    - **Validates: Requirements 10.4**

  - [x]* 4.5 Write unit tests for checklist edge cases
    - Test specific transition sequences, regression detection scenarios (R10.5)
    - Add to `test/fix-checklist.test.ts`
    - _Requirements: 10.2, 10.5_

- [x] 5. Implement incremental-verifier module (`src/incremental-verifier.ts`)
  - [x] 5.1 Create `src/incremental-verifier.ts` with types and core functions
    - Define `VerificationStrategy`, `VerificationDecision`, `VerificationResult`
    - Implement `determineVerificationStrategy` with 50-line threshold
    - Implement `buildVerificationCriteria` to extract scope from a finding
    - Set `INCREMENTAL_THRESHOLD = 50`
    - _Requirements: 9.1, 9.2, 9.4_

  - [x]* 5.2 Write property test for verification strategy threshold (Property 20)
    - **Property 20: Verification strategy threshold**
    - Test that `linesChanged < 50` → `"incremental"`, `linesChanged >= 50` → `"targeted-review"`
    - Add to `test/incremental-verifier.property.test.ts`
    - **Validates: Requirements 9.1, 9.4**

- [x] 6. Implement fix-recovery module (`src/fix-recovery.ts`)
  - [x] 6.1 Create `src/fix-recovery.ts` with types and core functions
    - Define `RecoveryCandidate`, `RecoveryResult`
    - Implement `isFixCandidate` with ±10 line tolerance
    - Implement `parseGitLog` for `--format="%H|%s|%aI" --name-only` format
    - _Requirements: 11.1, 11.3_

  - [x]* 6.2 Write property test for fix candidate matching (Property 25)
    - **Property 25: Fix candidate matching**
    - Test that commits modifying the finding's file within ±10 lines return true, others return false
    - Add to `test/fix-recovery.property.test.ts`
    - **Validates: Requirements 11.3**

  - [x]* 6.3 Write unit tests for git log parsing and edge cases
    - Test `parseGitLog` with real-format samples, empty/malformed output, no-match scenario (R11.4)
    - Add to `test/fix-recovery.test.ts`
    - _Requirements: 11.3, 11.4_

- [x] 7. Checkpoint — Verify all new modules pass CI
  - Run `npm run check` and ensure all tests pass
  - Ensure all four new modules compile and their tests pass
  - Ask the user if questions arise

- [x] 8. Extend ship.ts with checklist gate
  - [x] 8.1 Add `checkShipGateWithChecklist` to `src/ship.ts`
    - Import `ChecklistEntry` from `src/fix-checklist.ts`
    - Implement `checkShipGateWithChecklist` that adds a fourth gate: all checklist entries must be `"verified"`
    - Preserve existing `checkShipGate` unchanged for backward compatibility
    - _Requirements: 10.3_

  - [x]* 8.2 Write property test for ship gate checklist blocking (Property 19)
    - **Property 19: Ship gate blocks on unverified checklist entries**
    - Test that any non-`"verified"` entry → `allowed: false`; all `"verified"` + other gates pass → `allowed: true`
    - Add to `test/ship.property.test.ts`
    - **Validates: Requirements 10.3**

- [x] 9. Extend state.ts with multi-task status tracking
  - [x] 9.1 Add multi-task types and functions to `src/state.ts`
    - Define `TaskStatusEntry` interface
    - Implement `parseStatusEntries` with legacy single-task format detection
    - Implement `serializeStatusEntries`
    - Implement `upsertTaskEntry`, `removeTaskEntry`, `detectConflict`
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6_

  - [x]* 9.2 Write property test for multi-task status round-trip (Property 21)
    - **Property 21: Multi-task status round-trip**
    - Test that `serializeStatusEntries` → `parseStatusEntries` produces equivalent entries
    - Add to `test/multi-task-status.property.test.ts`
    - **Validates: Requirements 8.1**

  - [x]* 9.3 Write property test for multi-task upsert (Property 22)
    - **Property 22: Multi-task upsert preserves other entries**
    - Test that new entries are added and existing entries are updated while preserving others
    - Add to `test/multi-task-status.property.test.ts`
    - **Validates: Requirements 8.2**

  - [x]* 9.4 Write property test for multi-task remove (Property 23)
    - **Property 23: Multi-task remove preserves other entries**
    - Test that removing an entry preserves all other entries unchanged
    - Add to `test/multi-task-status.property.test.ts`
    - **Validates: Requirements 8.5**

  - [x]* 9.5 Write property test for multi-task conflict detection (Property 24)
    - **Property 24: Multi-task conflict detection**
    - Test that `detectConflict` returns true iff an entry with the given `taskName` exists
    - Add to `test/multi-task-status.property.test.ts`
    - **Validates: Requirements 8.4**

  - [x]* 9.6 Write unit tests for legacy format migration
    - Test legacy single-task format parsing and auto-migration to multi-task format (R8.6)
    - Add to `test/multi-task-status.test.ts`
    - _Requirements: 8.6_

- [x] 10. Checkpoint — Verify extended modules pass CI
  - Run `npm run check` and ensure all tests pass
  - Verify ship.ts and state.ts extensions compile and pass tests
  - Ask the user if questions arise

- [x] 11. Update barrel file (`src/index.ts`)
  - [x] 11.1 Export new types and functions from `src/index.ts`
    - Add exports for `backlog.ts`: `BacklogEntry`, `parseBacklog`, `serializeBacklog`, `appendToBacklog`, `findOverlappingEntries`, `resolveEntry`, `generateBacklogHeader`
    - Add exports for `fix-checklist.ts`: `ChecklistStatus`, `ChecklistEntry`, `VALID_TRANSITIONS`, `isValidTransition`, `createChecklist`, `updateEntryStatus`, `allEntriesVerified`, `parseChecklist`, `serializeChecklist`
    - Add exports for `incremental-verifier.ts`: `VerificationStrategy`, `VerificationDecision`, `VerificationResult`, `INCREMENTAL_THRESHOLD`, `determineVerificationStrategy`, `buildVerificationCriteria`
    - Add exports for `fix-recovery.ts`: `RecoveryCandidate`, `RecoveryResult`, `isFixCandidate`, `parseGitLog`
    - Add exports for new ship.ts function: `checkShipGateWithChecklist`
    - Add exports for new state.ts types/functions: `TaskStatusEntry`, `parseStatusEntries`, `serializeStatusEntries`, `upsertTaskEntry`, `removeTaskEntry`, `detectConflict`
    - Add exports for new context-budget.ts functions: `isValidSeverity`, `isValidSubagentStatus`
    - _Requirements: 10.1, 10.2, 10.3_

  - [x]* 11.2 Verify barrel file exports with existing barrel file test
    - Ensure `test/barrel-file.test.ts` passes or update it to cover new exports
    - _Requirements: 10.1_

- [x] 12. Update SKILL documents
  - [x] 12.1 Add CI command section to `skills/forge-build/SKILL.md`
    - Add "CI 验证命令" section instructing AI to read `ci_check_command` from `.forge/config.md`
    - Add context budget management section referencing Explore_Summarizer, Test_Output_Trimmer, Git_Output_Limiter, Subagent_Summary_Protocol
    - Do not modify existing SKILL content (TDD rules, gates, etc.)
    - _Requirements: 12.1, 12.5, 13.1_

  - [x] 12.2 Add CI command section to `skills/forge-test/SKILL.md`
    - Add "CI 验证命令" section for test verification context
    - Do not modify existing SKILL content
    - _Requirements: 12.2, 12.5_

  - [x] 12.3 Extend context budget section in `skills/forge-review/SKILL.md`
    - Add or extend context budget management section referencing Review_Summarizer and write-and-discard protocol
    - Do not modify existing SKILL content (three-layer review, severity grading, etc.)
    - _Requirements: 13.2_

  - [x] 12.4 Add context budget section to `skills/forge-decide/SKILL.md`
    - Add context budget management section referencing Subagent_Summary_Protocol and write-and-discard protocol
    - Do not modify existing SKILL content
    - _Requirements: 13.3_

  - [x]* 12.5 Write SKILL contract tests for new sections
    - Test that forge-build and forge-test SKILL documents contain CI command sections (R12)
    - Test that forge-build, forge-review, forge-decide SKILL documents contain context budget sections (R13)
    - Add to `test/skill-contract.test.ts`
    - _Requirements: 12.1, 12.2, 12.5, 13.1, 13.2, 13.3, 13.4_

- [x] 13. Verify remaining round-trip property tests
  - [x]* 13.1 Verify/extend property test for explore summary round-trip (Property 1)
    - **Property 1: Explore summary round-trip**
    - Ensure existing test in `test/context-budget-roundtrip.property.test.ts` covers the updated module
    - **Validates: Requirements 1.4, 1.6**

  - [x]* 13.2 Verify/extend property test for review summary round-trip (Property 3)
    - **Property 3: Review summary round-trip**
    - Ensure existing test in `test/context-budget-roundtrip.property.test.ts` covers the updated module
    - **Validates: Requirements 2.5**

  - [x]* 13.3 Verify/extend property test for test output round-trip (Property 4)
    - **Property 4: Test output summary round-trip**
    - Ensure existing test covers the new `rawOutput` field
    - **Validates: Requirements 3.6**

  - [x]* 13.4 Verify/extend property test for subagent conditional fields (Property 9)
    - **Property 9: Subagent summary conditional fields**
    - Ensure existing test covers BLOCKED/NEEDS_CONTEXT blocking reason and DONE_WITH_CONCERNS concerns
    - **Validates: Requirements 5.3, 5.4**

  - [x]* 13.5 Verify/extend property test for context budget low-savings warning (Property 11)
    - **Property 11: Context budget low-savings warning**
    - Ensure existing test covers the <30% warning threshold
    - **Validates: Requirements 14.3**

- [x] 14. Final checkpoint — Ensure all tests pass
  - Run `npm run check` and ensure the full CI suite passes
  - Verify all 26 correctness properties are covered by tests
  - Verify all requirements (R1–R15) are addressed by implementation tasks
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document (26 total)
- Unit tests validate specific examples, edge cases, and integration points
- The fix-before-extend strategy (tasks 1–2) ensures P1 bugs are resolved before new features build on `context-budget.ts`
- SKILL document changes (task 12) are behavioral instructions in markdown, not executable code — but they are testable via contract tests
