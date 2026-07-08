---
feature: execution-package-context-control
layout: tasks
created: 2026-06-07
spec_ref: ".forge/specs/execution-package-context-control/requirements.md"
---
# Tasks

## Overview

Implement plan-time execution packaging so Forge can prevent context exhaustion from both many small tasks and a few oversized tasks.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["T-01", "T-02", "T-03"] },
    { "wave": 2, "tasks": ["T-04", "T-05", "T-06"] },
    { "wave": 3, "tasks": ["T-07", "T-08", "T-09"] },
    { "wave": 4, "tasks": ["T-10", "T-11", "T-12"] },
    { "wave": 5, "tasks": ["T-13", "T-14", "T-15"] }
  ]
}
```

## Task Definitions

### T-01 Add task weight model

- **Goal**: Add TypeScript types and pure helpers for `task_weight`.
- **Depends On**: []
- **Files**: `src/plan.ts`, `test/plan-package-weight.test.ts`
- **RED**: Add tests for overweight detection thresholds.
- **GREEN**: Implement weight classification helper.
- **REFACTOR**: Normalize threshold constants and exported result names.
- **Verify Command**: `npx vitest run test/plan-package-weight.test.ts`
- **Definition of Done**: All overweight thresholds are covered.

### T-02 Add overweight task split validation

- **Goal**: Validate that overweight tasks cannot pass plan self-check without split metadata.
- **Depends On**: [T-01]
- **Files**: `src/plan.ts`, `test/plan-overweight-split.test.ts`
- **RED**: Add failing tests for overweight task accepted unchanged.
- **GREEN**: Add validation that reports split-required errors.
- **REFACTOR**: Keep validation pure and reusable from skill instructions.
- **Verify Command**: `npx vitest run test/plan-overweight-split.test.ts`
- **Definition of Done**: `monolith_acknowledged` does not bypass overweight validation.

### T-03 Add task DAG split preservation helpers

- **Goal**: Preserve dependencies when a task is split into child tasks.
- **Depends On**: [T-01]
- **Files**: `src/task-graph.ts`, `test/task-graph-split.test.ts`
- **RED**: Add tests for incoming/outgoing dependency rewrites.
- **GREEN**: Implement split dependency rewrite helper.
- **REFACTOR**: Reuse existing cycle validation where possible.
- **Verify Command**: `npx vitest run test/task-graph-split.test.ts`
- **Definition of Done**: Split tasks produce an acyclic graph with no omitted dependents.

### T-04 Add execution package generator

- **Goal**: Generate bounded packages from a topologically sorted task graph.
- **Depends On**: [T-03]
- **Files**: `src/plan.ts`, `test/execution-package-generator.test.ts`
- **RED**: Add tests for 10+ tasks, 6-9 tasks, high-risk isolation, and dependency boundaries.
- **GREEN**: Implement package generation with task count, LOC, and file budgets.
- **REFACTOR**: Extract package metadata formatting.
- **Verify Command**: `npx vitest run test/execution-package-generator.test.ts`
- **Definition of Done**: Packages include `depends_on_packages` and no forward dependencies.

### T-05 Render execution packages in tasks.md

- **Goal**: Persist `execution_packages` in Forge tasks documents.
- **Depends On**: [T-04]
- **Files**: `src/spec-render.ts`, `src/spec-plan-upgrade.ts`, `test/spec-render-package.test.ts`
- **RED**: Add tests showing package metadata missing from rendered tasks.
- **GREEN**: Render package metadata in a parseable YAML or JSON block.
- **REFACTOR**: Keep legacy tasks rendering unchanged when no packages exist.
- **Verify Command**: `npx vitest run test/spec-render-package.test.ts`
- **Definition of Done**: Existing specs without packages remain backward compatible.

### T-06 Update plan instructions for Atomic Task and Package Gates

- **Goal**: Teach `/forge plan` to run Atomic Task Gate and Execution Package Gate.
- **Depends On**: [T-02, T-04]
- **Files**: `skills/forge/lib/plan/instructions.md`, `skills/forge/lib/plan/references/atomic-task-format.md`
- **RED**: Add instruction lint or text tests for required gate names.
- **GREEN**: Update plan instructions and references.
- **REFACTOR**: Keep monolith plan warning separate from package requirements.
- **Verify Command**: `rg "Atomic Task Gate|Execution Package Gate" skills/forge/lib/plan`
- **Definition of Done**: Instructions state `monolith_acknowledged` cannot bypass gates.

### T-07 Add package-aware status helpers

- **Goal**: Parse and update `current_package`, `completed_packages`, and `next_package`.
- **Depends On**: [T-04]
- **Files**: `src/status-file-ext.ts`, `test/status-file-ext-package.test.ts`
- **RED**: Add tests for package fields round-trip.
- **GREEN**: Implement parse/update/clear helpers.
- **REFACTOR**: Keep existing loop fields behavior unchanged.
- **Verify Command**: `npx vitest run test/status-file-ext-package.test.ts`
- **Definition of Done**: Package fields can coexist with loop fields.

### T-08 Add package summary schema

- **Goal**: Add schema-first package summary validation.
- **Depends On**: [T-04]
- **Files**: `src/schemas/package-summary.ts`, `test/package-summary-schema.test.ts`
- **RED**: Add tests for field limits and invalid raw-output summaries.
- **GREEN**: Implement zod schema and formatter.
- **REFACTOR**: Export schema from `src/schemas/index.ts`.
- **Verify Command**: `npx vitest run test/package-summary-schema.test.ts`
- **Definition of Done**: Summary limits are field-level, not only character-level.

### T-09 Update build package execution instructions

- **Goal**: Make `/forge build` execute one package at a time.
- **Depends On**: [T-07, T-08]
- **Files**: `skills/forge/lib/build/instructions.md`, `skills/forge/lib/build/references/context-budget.md`
- **RED**: Add instruction tests or grep assertions for package-only build behavior.
- **GREEN**: Update build instructions for `--package`, dependency checks, summaries, verify, and commits.
- **REFACTOR**: Keep legacy no-package flow documented as fallback.
- **Verify Command**: `rg "current package|--package|package summary" skills/forge/lib/build`
- **Definition of Done**: Build no longer instructs `/goal` to consume all tasks when packages exist.

### T-10 Make plan context injection phase/package aware

- **Goal**: Inject only current package context during build.
- **Depends On**: [T-07]
- **Files**: `scripts/inject-plan-context.mjs`, `test/inject-plan-context-package.test.ts`
- **RED**: Add tests showing completed package details are injected today.
- **GREEN**: Filter output by phase and package metadata.
- **REFACTOR**: Preserve fail-open behavior.
- **Verify Command**: `npx vitest run test/inject-plan-context-package.test.ts`
- **Definition of Done**: Build injection includes current package and omits completed task history.

### T-11 Update `/forge loop` package iteration behavior

- **Goal**: Make autonomous loop run one package per iteration.
- **Depends On**: [T-07, T-09]
- **Files**: `skills/forge/lib/loop/instructions.md`, `src/loop/phase-transitions.ts`, `test/loop/package-iteration.test.ts`
- **RED**: Add tests for next package scheduling and halted package state.
- **GREEN**: Add package-aware loop transition logic.
- **REFACTOR**: Keep existing no-package loop flow.
- **Verify Command**: `npx vitest run test/loop/package-iteration.test.ts`
- **Definition of Done**: `/forge loop` uses native scheduling for next package and does not reference legacy CLI orchestration.

### T-12 Update review/test/ship package gates

- **Goal**: Prevent partial package completion from shipping as a completed feature.
- **Depends On**: [T-07, T-08]
- **Files**: `src/ship-gates.ts`, `skills/forge/lib/review/instructions.md`, `skills/forge/lib/test/instructions.md`, `skills/forge/lib/ship/instructions.md`, `test/package-completion-gates.test.ts`
- **RED**: Add tests for incomplete package warnings/blocks.
- **GREEN**: Add package completion checks and package-scoped verdict language.
- **REFACTOR**: Keep legacy progress task checks intact.
- **Verify Command**: `npx vitest run test/package-completion-gates.test.ts`
- **Definition of Done**: Ship artifact includes package completion status.

### T-13 Add AskUserQuestion decision handling for package choices

- **Goal**: Ensure package-related user choices use AskUserQuestion instead of free-form command prompts.
- **Depends On**: [T-06, T-09]
- **Files**: `skills/forge/lib/plan/instructions.md`, `skills/forge/lib/build/instructions.md`, `skills/forge/lib/resume/instructions.md`, `shared/next-step-protocol.md`, `test/agent-prompt-discipline.test.ts`
- **RED**: Add tests or grep checks that reject plain "run this command" handoffs for package decisions.
- **GREEN**: Add AskUserQuestion guidance for package split approval, monolith handling, package-boundary continuation, and resume confirmation; add bounded fallback only for runtimes where AskUserQuestion is unavailable.
- **REFACTOR**: Keep no-mid-step-confirmation language intact for automatic transitions.
- **Verify Command**: `npx vitest run test/agent-prompt-discipline.test.ts`
- **Definition of Done**: Required user choices are interactive, automatic transitions remain automatic.

### T-14 Add compatibility audit for existing context defenses

- **Goal**: Prove execution packages layer cleanly with current context compression, Read dedup, compact snapshot, and resume recovery.
- **Depends On**: [T-07, T-10]
- **Files**: `.claude/settings.json`, `scripts/hook-precompact.sh`, `scripts/hook-postcompact.sh`, `scripts/inject-plan-context.mjs`, `scripts/track-read-budget.mjs`, `skills/forge/lib/resume/instructions.md`, `src/resume.ts`, `src/mcp/tools/forge-read-cached.ts`, `test/package-context-compatibility.test.ts`, `test/contract/precompact-restate-reminder.test.ts`
- **RED**: Add tests showing package fields are lost across compact snapshot today and phase-less plan context injection can include broad plan context.
- **GREEN**: Include package fields in compact snapshots, make resume package-aware, and make plan context injection infer phase/package from status when no `--phase` is passed.
- **REFACTOR**: Keep legacy snapshot behavior for non-package runs.
- **Verify Command**: `npx vitest run test/package-context-compatibility.test.ts test/contract/precompact-restate-reminder.test.ts`
- **Definition of Done**: Package state survives compact/resume, deprecated read-budget remains advisory, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` remains a safety net, and no legacy compact/read-cache/resume test regresses.

### T-15 Add saved workflow backend and naming standard

- **Goal**: Document and optionally wire Claude Code saved workflows as phase/package-scoped backends, with dynamic workflows/ultracode as optional exploratory paths.
- **Depends On**: [T-08, T-09, T-11]
- **Files**: `.claude/workflows/forge-review.js`, `.claude/workflows/multi-agent-review.js`, `.claude/rules/workflow-fallback-ladder.md`, `skills/forge/lib/decide/instructions.md`, `skills/forge/lib/plan/instructions.md`, `skills/forge/lib/build/instructions.md`, `skills/forge/lib/review/instructions.md`, `skills/forge/lib/test/instructions.md`, `skills/forge/lib/learn/instructions.md`, `skills/forge/lib/loop/instructions.md`, `docs/reference-advanced.md`, `test/package-workflow-backend.test.ts`, `test/workflow-naming.test.ts`
- **RED**: Add tests or documentation checks requiring workflows to be optional, package-scoped/phase-internal, stable-named, and never replacements for Forge gates.
- **GREEN**: Add backend-selection guidance for `single-agent`, `subagents`, `saved-workflow`, and `dynamic-workflow`; add stable workflow naming rules; rename `multi-agent-review.js` to `forge-review.js`; document ultracode as an effort/trigger setting rather than a Forge phase.
- **REFACTOR**: Keep workflow unavailable fallback explicit.
- **Verify Command**: `npx vitest run test/package-workflow-backend.test.ts test/workflow-naming.test.ts`
- **Definition of Done**: Saved workflows are positioned as L0 phase/package backends, generic workflow names are removed from production dispatch, and unavailable workflows fall back to subagents/single-agent paths.

### T-16 Final validation

- **Goal**: Verify full repository health.
- **Depends On**: [T-01, T-02, T-03, T-04, T-05, T-06, T-07, T-08, T-09, T-10, T-11, T-12, T-13, T-14, T-15]
- **Files**: none
- **RED**: N/A
- **GREEN**: Run full check.
- **REFACTOR**: Fix only issues introduced by this spec.
- **Verify Command**: `npm run check`
- **Definition of Done**: Full check passes and package-related tests cover both many-small-task and few-giant-task scenarios.
