---
feature: claude-2-1-169-inspired-hardening
layout: tasks
created: 2026-06-09
spec_ref: ".tinkerman/specs/claude-2-1-169-inspired-hardening/requirements.md"
---

# Tasks — Claude Code 2.1.169 Inspired Hardening

## Wave 1: Agent Dispatch Hardening

### Task 1: RED — dispatcher timeout and state tests

- [ ] 1.1 Add tests for `buildAgentArgs({ includeAll: true })` producing `--all`
- [ ] 1.2 Add tests for preserving JSON `id` and `state`
- [ ] 1.3 Add tests for `blocked`, `running`, and `just-dispatched` mapping to failed dispatch result
- [ ] 1.4 Add timeout test with diagnostic result

**Verify-By**: vitest — `npx vitest run test/contract/agents-dispatcher.test.ts`
**Requirements**: R1

### Task 2: GREEN — implement dispatcher timeout and JSON state parsing

- [ ] 2.1 Extend `DispatchOptions` and `DispatchResult`
- [ ] 2.2 Add `--all` arg support
- [ ] 2.3 Add `execFile` timeout and kill signal
- [ ] 2.4 Parse optional `id` and `state`
- [ ] 2.5 Preserve inline fallback semantics on failure

**Verify-By**: vitest — `npx vitest run test/contract/agents-dispatcher.test.ts`
**Requirements**: R1

## Wave 2: Diagnostic Mode

### Task 3: RED — diagnostic mode injector tests

- [ ] 3.1 Add script test for `FORGE_DIAGNOSTIC_MODE=1`
- [ ] 3.2 Assert stdout is empty and exit code is 0
- [ ] 3.3 Add regression test for default evolved-rules injection behavior

**Verify-By**: vitest — `npx vitest run test/scripts/inject-evolved-rules.test.ts`
**Requirements**: R2

### Task 4: GREEN — implement Forge diagnostic mode

- [ ] 4.1 Add env check to `scripts/inject-evolved-rules.mjs`
- [ ] 4.2 Add doctor/status surface for active diagnostic mode if a doctor module exists
- [ ] 4.3 Ensure no hook JSON payload is emitted in diagnostic mode

**Verify-By**: vitest — `npx vitest run test/scripts/inject-evolved-rules.test.ts`
**Requirements**: R2

## Wave 3: Compatibility Documentation

### Task 5: RED — compatibility doc assertions

- [ ] 5.1 Add or extend documentation check for `2.1.169`
- [ ] 5.2 Check for `FORGE_DIAGNOSTIC_MODE`
- [ ] 5.3 Check for `claude agents --json --all`, `id`, and `state`

**Verify-By**: bash — `grep -n '2.1.169\\|FORGE_DIAGNOSTIC_MODE\\|--all' docs/claude-code-compatibility.md`
**Requirements**: R3

### Task 6: GREEN — update compatibility matrix

- [ ] 6.1 Add v2.1.169 section and changelog date
- [ ] 6.2 Add Forge action/degradation rows for relevant features
- [ ] 6.3 Clarify operator-only features vs Forge-implemented features

**Verify-By**: bash — `grep -n '2.1.169\\|2026-06-08\\|FORGE_DIAGNOSTIC_MODE' docs/claude-code-compatibility.md`
**Requirements**: R3

## Wave 4: Worktree Edit Preflight

### Task 7: RED — subagent prompt preflight tests

- [ ] 7.1 Add test for editable subagent prompt containing worktree preflight
- [ ] 7.2 Add test that read-only review prompt is not needlessly bloated
- [ ] 7.3 Add test that preflight survives prompt truncation ordering

**Verify-By**: vitest — `npx vitest run test/review-subagent-prompt.test.ts test/contract/agents-dispatcher.test.ts`
**Requirements**: R4

### Task 8: GREEN — implement preflight prompt helper

- [ ] 8.1 Add reusable worktree edit preflight constant/helper
- [ ] 8.2 Wire helper into editable subagent prompt builders
- [ ] 8.3 Keep read-only review prompts unchanged unless explicitly opted in

**Verify-By**: vitest — `npx vitest run test/review-subagent-prompt.test.ts test/contract/agents-dispatcher.test.ts`
**Requirements**: R4

## Wave 5: Context Budget Thresholds

### Task 9: RED — context threshold tests

- [ ] 9.1 Add tests for 100K, 200K, and 1M context windows
- [ ] 9.2 Add fallback test for unknown context window
- [ ] 9.3 Add invalid ratio/default behavior tests

**Verify-By**: vitest — `npx vitest run test/context-budget-contract.test.ts test/context-budget.property.test.ts`
**Requirements**: R5

### Task 10: GREEN — implement model-window-aware helper

- [ ] 10.1 Add `computeContextBudgetThresholds()` to `src/context-budget.ts`
- [ ] 10.2 Preserve current configured-budget fallback
- [ ] 10.3 Document conservative token-estimate caveat

**Verify-By**: vitest — `npx vitest run test/context-budget-contract.test.ts test/context-budget.property.test.ts`
**Requirements**: R5

## Wave 6: Execution Metadata

### Task 11: RED — metadata status/resume tests

- [ ] 11.1 Add status metadata serialization roundtrip test
- [ ] 11.2 Add backward-compatibility test for old status files without metadata
- [ ] 11.3 Add secret exclusion test
- [ ] 11.4 Add resume metadata summary test

**Verify-By**: vitest — `npx vitest run test/status-file-ext.test.ts test/resume.property.test.ts`
**Requirements**: R6

### Task 12: GREEN — implement execution metadata persistence

- [ ] 12.1 Add `ExecutionMetadata` type and allowlisted serializer/parser
- [ ] 12.2 Persist metadata in status/progress writer path
- [ ] 12.3 Add compact metadata line to resume output when present
- [ ] 12.4 Exclude secrets and unrelated environment variables

**Verify-By**: vitest — `npx vitest run test/status-file-ext.test.ts test/resume.property.test.ts`
**Requirements**: R6

## Wave 7: Integration And Ship Readiness

### Task 13: Full verification

- [ ] 13.1 Run all focused tests from Tasks 1-12
- [ ] 13.2 Run `npm run typecheck`
- [ ] 13.3 Run `npm run check`
- [ ] 13.4 If `src/**/*.ts` changed, run `npm run dist:resync`
- [ ] 13.5 Confirm `git diff --name-only` contains matching `dist/src/**` files for TS changes

**Verify-By**: bash — `npm run check`
**Requirements**: R1, R2, R3, R4, R5, R6

