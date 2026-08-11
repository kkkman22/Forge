---
feature: loop-skills-fusion
layout: tasks
created: 2026-04-28
spec_ref: ".tinkerman/specs/loop-skills-fusion/requirements.md"
---

# Implementation Plan: Loop × Skills Fusion

## Overview

This plan implements the remaining ~30% of Loop × Skills Fusion: connecting the already-implemented pure functions (SkillScheduler, ExecutionMode, StatusFile extensions) with the SdkDriver's skill-aware iteration mode, adding `buildSkillAwarePrompt()` content completeness, integrating quality gates into the loop, adding pre-flight checks to the CLI, and writing property-based tests for all 11 correctness properties defined in the design.

Since most pure function modules are already fully implemented, tasks focus on:
1. Property-based tests for existing pure functions (Properties 1–9, 11)
2. New `buildSkillAwarePrompt` content completeness validation (Property 10)
3. SdkDriver skill-aware iteration integration with QualityGate
4. CLI pre-flight checks and SKILL.md updates
5. Integration testing

## Tasks

- [x] 1. Property-based tests for existing pure function modules
  - [x] 1.1 Write property test for ExecutionMode round-trip consistency
    - **Property 1: ExecutionMode 往返一致性**
    - Verify `getExecutionMode(writeExecutionMode(content, mode))` returns the written mode for all valid modes
    - Verify `getExecutionMode(clearExecutionMode(writeExecutionMode(content, mode)))` returns `"interactive"`
    - Use fast-check generators for StatusFile content with arbitrary frontmatter fields
    - **Validates: Requirements 13.1, 13.4**
    - _Requirements: 13.1, 13.4_

  - [x] 1.2 Write property test for autonomous mode confirmation point behavior
    - **Property 2: 自主模式確認点全自動**
    - Verify for all ConfirmationPoints: `resolveConfirmation("autonomous", point)` returns `action: "auto"` with a defined preset string
    - Verify for all ConfirmationPoints: `resolveConfirmation("interactive", point)` returns `action: "wait_for_user"` with no preset
    - **Validates: Requirements 2.2, 2.3**
    - _Requirements: 2.2, 2.3_

  - [x] 1.3 Write property test for LoopStatusFields round-trip consistency
    - **Property 3: LoopStatusFields 往返一致性**
    - Verify `extractLoopFields(writeLoopFields(content, fields))` returns equivalent field values
    - Verify `extractLoopFields(clearLoopFields(writeLoopFields(content, fields)))` returns all fields as undefined
    - Use fast-check generators for LoopStatusFields with valid UUIDs, iteration numbers, skill sequences
    - **Validates: Requirements 6.1, 6.3, 13.2, 13.3**
    - _Requirements: 6.1, 6.3, 13.2, 13.3_

  - [x] 1.4 Write property test for writeLoopFields preserving non-Loop fields
    - **Property 4: writeLoopFields 保留非 Loop 字段**
    - Generate StatusFile content with arbitrary non-Loop frontmatter fields
    - Verify all non-Loop fields are preserved unchanged after `writeLoopFields()`
    - **Validates: Requirements 13.5**
    - _Requirements: 13.5_

  - [x] 1.5 Write property test for SkillScheduler total function property
    - **Property 5: SkillScheduler 全函数性**
    - Verify `determineNextSkill()` never throws for any valid SchedulerInput (including unknown `currentPhase` values)
    - Verify it always returns a valid SchedulerResult with a recognized SkillPhase
    - Verify unknown `currentPhase` values fall back to `"router"`
    - Verify terminal states (`"completed"`, `"aborted"`) return themselves (idempotent)
    - **Validates: Requirements 12.1, 12.2, 12.4**
    - _Requirements: 12.1, 12.2, 12.4_

  - [x] 1.6 Write property test for SkillScheduler circuit breaker
    - **Property 6: SkillScheduler 熔断保護**
    - Verify for any input where `reviewFixAttempts >= maxReviewFixAttempts` and `reviewResult === "fail"`, result is `nextPhase: "aborted"`
    - **Validates: Requirements 5.5, 12.3**
    - _Requirements: 5.5, 12.3_

  - [x] 1.7 Write property test for SkillScheduler convergence
    - **Property 7: SkillScheduler 收斂性**
    - Simulate successive transitions from any non-terminal SkillPhase with favorable conditions
    - Verify convergence to `"completed"` or `"aborted"` within a bounded number of steps (≤ 20)
    - **Validates: Requirements 12.5**
    - _Requirements: 12.5_

  - [x] 1.8 Write property test for shouldCommitForPhase correctness
    - **Property 8: shouldCommitForPhase Commit 策略正確性**
    - Verify commitable phases (`"build"`, `"plan"`, `"fix"`, `"refactor-apply"`, `"fix-apply"`) with `success=true` return `true`
    - Verify non-commitable phases (`"review"`, `"test"`, `"ship"`, `"router"`, `"learn"`, `"refactor-scan"`, `"fix-analyze"`) return `false` regardless of success
    - Verify any phase with `success=false` returns `false`
    - Verify unknown phase strings return `false`
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.5**
    - _Requirements: 11.1, 11.2, 11.3, 11.5_

  - [x] 1.9 Write property test for getCommandSequence safe default
    - **Property 9: getCommandSequence 安全默認值**
    - Verify for any tier string not in the known set, `getCommandSequence()` returns the standard sequence
    - **Validates: Requirements 12.6**
    - _Requirements: 12.6_

  - [x] 1.10 Write property test for updateIterationStatus field update
    - **Property 11: updateIterationStatus 字段更新**
    - Verify calling `updateIterationStatus(content, phase, iteration)` then extracting `phase` and `loop_iteration` returns the written values
    - **Validates: Requirements 3.6, 6.2**
    - _Requirements: 3.6, 6.2_

- [x] 2. Checkpoint - Ensure all property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. buildSkillAwarePrompt content completeness property test and enhancements
  - [x] 3.1 Write property test for buildSkillAwarePrompt content completeness
    - **Property 10: buildSkillAwarePrompt 内容完整性**
    - Verify for any valid SkillPromptParams with non-empty phase: output contains the phase name, the tier, and `mode: autonomous` directive
    - Verify when `fixIssues` are provided, all issue descriptions appear in the output
    - Use fast-check generators for SkillPromptParams with arbitrary phases, tiers, hints, and fix issues
    - **Validates: Requirements 1.2, 1.5, 5.2**
    - _Requirements: 1.2, 1.5, 5.2_

  - [x] 3.2 Write unit tests for buildSkillAwarePrompt edge cases
    - Test build phase prompt includes task context when provided
    - Test review phase prompt includes P0/P1 issue details when fixIssues provided
    - Test empty phase triggers routing analysis instruction
    - Test PUA context injection at L3/L4 includes Proactive Initiative Checklist
    - _Requirements: 1.3, 1.4, 1.5_

- [x] 4. Quality gate integration with SdkDriver
  - [x] 4.1 Implement quality gate evaluation in skill-aware iteration
    - In `SdkDriver.executeSkillAwareIteration()`, after agent reports review/test/ship completion:
      - Call `evaluateReviewGate()` when `skill_phase_completed === "review"`
      - Call `evaluateTestGate()` when `skill_phase_completed === "test"`
      - Call `evaluateShipGate()` when `skill_phase_completed === "ship"`
    - Map gate results to `gate_result` field on AgentOutput
    - Update `reviewFixAttempts` counter based on gate evaluation
    - Add `readStatusFile`/`writeStatusFile` callbacks for reading review/test/progress files
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 4.2 Write unit tests for quality gate integration
    - Test review gate blocked → increments reviewFixAttempts
    - Test review gate passed → resets reviewFixAttempts to 0
    - Test test gate blocked → marks iteration as soft failure
    - Test ship gate blocked → aborts ship and marks soft failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 5. SdkDriver skill-aware StatusFile lifecycle management
  - [x] 5.1 Implement Loop startup StatusFile field writing
    - On `SdkDriver.run()` entry when `skillAware=true`:
      - Write `mode: "autonomous"`, `loop_run_id`, `loop_iteration: 0`, `skill_sequence` to StatusFile
      - Use `writeLoopFields()` pure function + `writeStatusFile` callback
    - Handle residual Loop state from previous abnormal exit (detect existing `loop_run_id`, clean and continue)
    - _Requirements: 6.1, 6.5, 6.6, 10.5_

  - [x] 5.2 Implement Loop completion StatusFile cleanup
    - On normal completion (SkillScheduler returns `completed`): clear `mode`, `loop_run_id`, `loop_iteration`, `skill_sequence`
    - On abnormal exit (aborted/error): clear `mode`, `loop_run_id`, `loop_iteration` but preserve `phase`
    - Use `clearLoopFields()` pure function
    - _Requirements: 6.3, 6.4, 6.6_

  - [x] 5.3 Write unit tests for StatusFile lifecycle
    - Test startup writes all Loop fields correctly
    - Test normal completion clears all Loop fields
    - Test abnormal exit preserves phase field
    - Test residual state detection and cleanup
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. CLI pre-flight checks
  - [x] 7.1 Implement pre-flight validation in forge-loop-cli
    - Add `.tinkerman/` directory existence check (already partially done via `detectSkillAwareMode`)
    - Add StatusFile active task detection: if `phase` is not `completed`/`aborted`, warn user
    - Add empty objective validation (already done via Commander `<objective>` required arg)
    - Add `--tier` value validation against known set (`light`, `standard`, `full`)
    - Add hooks.json presence warning (non-blocking, already done via `validateHooksPresence`)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6_

  - [x] 7.2 Write unit tests for CLI pre-flight checks
    - Test missing `.tinkerman/` directory outputs error and exits
    - Test active task in StatusFile outputs warning
    - Test invalid `--tier` value outputs valid options and exits
    - Test missing hooks.json outputs warning but does not block
    - _Requirements: 10.1, 10.2, 10.4, 10.6_

- [x] 8. Git commit strategy integration
  - [x] 8.1 Wire shouldCommitForPhase into SdkDriver effect dispatch
    - After skill-aware iteration completes, use `shouldCommitForPhase(phase, success)` to decide commit/rollback
    - On commit decision: dispatch `commit` effect with appropriate message format per phase
    - On rollback decision (build/fix failure): dispatch `rollback` effect
    - Handle commit failure as hard failure with backoff
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 8.2 Write unit tests for commit strategy wiring
    - Test build success triggers commit with plan-defined message
    - Test plan approved triggers commit with `forge(plan): <topic> plan approved`
    - Test fix success triggers commit with `forge(fix): resolve P0/P1 from review`
    - Test review/test completion does not trigger commit
    - Test build failure triggers rollback
    - Test commit failure triggers hard failure event
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 9. Iteration result reporting
  - [x] 9.1 Implement structured completion/abort summary output
    - On normal completion: output objective, tier, total iterations, per-phase pass/fail status, branch name
    - On circuit breaker abort: output unresolved P0/P1 issues list and recovery suggestions
    - On error abort: output error reason and `/forge resume` suggestion
    - Format as structured console output matching SKILL.md examples
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 9.2 Write unit tests for result reporting
    - Test normal completion summary includes all required fields
    - Test abort summary includes P0/P1 issues
    - Test error summary includes recovery suggestion
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. SKILL.md and distribution package updates
  - [x] 11.1 Update skills/forge-loop/SKILL.md with implementation details
    - Ensure SKILL.md reflects the actual implemented behavior
    - Add any new CLI options or behavioral changes
    - Verify state file format documentation matches implementation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 12. Final integration wiring
  - [x] 12.1 Wire all components together in SdkDriver skill-aware mode
    - Ensure `executeSkillAwareIteration()` calls SkillScheduler → buildSkillAwarePrompt → Agent → QualityGate → EffectExecutor in correct order
    - Ensure StatusFile is read at iteration start and updated at iteration end
    - Ensure `reviewFixAttempts` counter drives circuit breaker correctly
    - Ensure Loop fields are written at startup and cleared at exit
    - _Requirements: 1.1, 1.2, 1.6, 3.1, 3.4, 3.5, 3.6_

  - [x] 12.2 Write integration tests for full skill-aware iteration flow
    - Test complete happy path: router → plan → build → review → test → ship → completed
    - Test fix loop: review blocked → build (fix) → review passed → test → ship
    - Test circuit breaker: review blocked × 3 → aborted
    - Test StatusFile lifecycle across full flow
    - Mock AgentInterface and EffectExecutor for deterministic testing
    - _Requirements: 1.1, 1.6, 3.4, 5.1, 5.5, 6.1, 6.3_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Many pure function modules (execution-mode, status-file-ext, skill-scheduler, loop-types) are already fully implemented — tasks focus on testing and integration
- The project uses TypeScript, Vitest, fast-check, and Biome (lint/format)
- Test files follow the naming convention `test/<module>.property.test.ts` and `test/<module>.test.ts`
