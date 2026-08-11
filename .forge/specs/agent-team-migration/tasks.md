---
feature: agent-team-migration
layout: tasks
created: 2026-04-29
spec_ref: ".forge/specs/agent-team-migration/requirements.md"
---

# Tasks

## Task 1: Create Subagent invocation protocol types and parallel runner

- [x] 1.1 Add `SubagentInvocation`, `SubagentResult`, and `ParallelExecutionResult` interfaces to `src/loop-types.ts`
- [x] 1.2 Create `src/subagent-runner.ts` with `runSubagentsInParallel()` function that uses `Promise.allSettled()` to execute invocations concurrently and returns `ParallelExecutionResult`
- [x] 1.3 Write property test `test/subagent-runner.property.test.ts` for Property 2 (parallel execution fault tolerance): for any mix of success/failure subagent results, all successful results are preserved and all failures are reported
- [x] 1.4 Write property test for Property 5 (invocation protocol completeness): for any subagent invocation built by the system, it contains non-empty prompt, valid permissionMode, positive maxTurns, and valid agentType

## Task 2: Migrate Review engine from Agent Team to Subagent parallel execution

- [x] 2.1 Add `buildReviewSubagents(context)` function to `src/review.ts` that returns the correct `SubagentInvocation[]` based on spec availability (3 subagents with spec, 2 without)
- [x] 2.2 Write property test `test/review-subagent-selection.property.test.ts` for Property 1 (review subagent selection): for any review context, quality-check and security-check are always included, spec-check is included iff hasSpec is true
- [x] 2.3 Add `mergeReviewResults(results: SubagentResult[])` function to `src/review.ts` that feeds successful subagent outputs into the existing merge pipeline (filterByConfidence → deduplicateFindings → applyCrossValidation)
- [x] 2.4 Verify all existing review tests pass (`test/review.property.test.ts`) to confirm backward compatibility of merge pipeline

## Task 3: Migrate Decide engine from Agent Team to two-round Subagent execution

- [x] 3.1 Rename `TeamMember` to `SubagentConfig` in `src/decide.ts` and update `getDecideTeamMembers` to `getDecideSubagents`, preserving the same logic
- [x] 3.2 Add `buildDecideRound1Subagents(context: DecideContext)` function that maps `SubagentConfig[]` to `SubagentInvocation[]` for Round 1 perspective subagents
- [x] 3.3 Add `buildDecideCriticInvocation(round1Outputs, context)` function that constructs the Round 2 critic subagent invocation with all Round 1 outputs as context
- [x] 3.4 Add `resolveDecideStatus(criticOutput)` function that returns `needs_revision` when blocking issues are present, `confirmed` otherwise
- [x] 3.5 Write property test `test/decide-subagent-selection.property.test.ts` for Property 3 (decide member selection): product, architect, security always included; designer included iff involvesUIChanges is true
- [x] 3.6 Write property test `test/decide-critic-status.property.test.ts` for Property 4 (critic blocking → needs_revision): blocking issues → needs_revision, no blocking → confirmed

## Task 4: Migrate Build full-path research phase from Agent Team to Subagent parallel execution

- [x] 4.1 Add `buildResearchSubagents(topics: string[])` function to `src/build.ts` that creates one `SubagentInvocation` per research topic
- [x] 4.2 Add `mergeResearchFindings(results: SubagentResult[])` function to `src/build.ts` that combines all successful research outputs into a single findings document
- [x] 4.3 Write property test `test/research-merge.property.test.ts` for Property 6 (research findings merge completeness): for any set of successful research outputs, merged document contains all findings with none lost
- [x] 4.4 Verify all existing build tests pass (`test/build.property.test.ts`) to confirm backward compatibility

## Task 5: Update SKILL documents to reflect Subagent execution model

- [x] 5.1 Update `skills/forge-review/SKILL.md`: replace Section 2 (Agent Team 配置) with Subagent parallel execution instructions, remove Agent Team startup/cleanup steps from Section 10 execution flow, update flow diagram
- [x] 5.2 Update `skills/forge-decide/SKILL.md`: replace Section 2 (Agent Team 配置) with two-round Subagent execution instructions, remove Agent Team startup/cleanup steps from Section 4 execution flow, update flow diagram
- [x] 5.3 Update `skills/forge-build/SKILL.md`: replace Section 3.3 Phase 1 Agent Team research description with independent Subagent parallel research instructions
- [x] 5.4 Verify all non-Agent-Team content in SKILL documents is preserved (severity grading, confidence filtering, merge pipeline, TDD rules, quality gates)

## Task 6: Update CLAUDE.md and templates/CLAUDE.md

- [x] 6.1 In `CLAUDE.md`: replace "Agent Team 配置" section with "Subagent 并行执行配置" section describing the new model
- [x] 6.2 In `CLAUDE.md` Section 3.1: update "Agent Team（spec-check、quality-check、security-check）" to "独立 Subagent（spec-check、quality-check、security-check）"
- [x] 6.3 In `templates/CLAUDE.md`: apply the same changes as 6.1 and 6.2

## Task 7: Clean up obsolete Agent Team configurations

- [x] 7.1 Delete `teams/` directory (including `teams/decide/config.json`, `teams/review/config.json`, `teams/README.md`, and `.gitkeep` files)
- [x] 7.2 Delete `.claude/teams/` directory (including `.claude/teams/decide/config.json` and `.claude/teams/review/config.json`)
- [x] 7.3 Remove all references to `.claude/teams/` JSON files as "参考材料" from SKILL documents
- [x] 7.4 Search and update any remaining references to `teams/` directory or Agent Team configuration across the codebase (including contract tests in `test/contract.test.ts` if applicable)

## Task 8: Run full test suite and verify backward compatibility

- [x] 8.1 Run `npx vitest run` to verify all existing tests pass after migration
- [x] 8.2 Run `npx tsc --noEmit` to verify no type errors
- [x] 8.3 Run the project's lint/format check to verify code quality
