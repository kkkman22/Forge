---
feature: execution-package-context-control
layout: design
created: 2026-06-07
---
# Design Document

## Overview

This design introduces plan-time execution packaging as the primary defense against build context exhaustion. Instead of waiting until context is already high and then relying on compaction, Forge creates deterministic package boundaries before build starts.

The design preserves the current three-file spec layout and the current `/forge loop` Native Fusion Loop concept. It does not revive the removed legacy `forge-loop-cli`. It adds package metadata to the plan/tasks layer and teaches build, resume, hooks, review, and loop to use that metadata.

## Architecture

```text
PM requirements-only input
  -> decide: risk and decision assessment
  -> spec: requirements/design/tasks synthesis
  -> plan:
       Atomic Task Gate
       Task DAG validation
       Execution Package generation
  -> build:
       execute package Pn only
       write package summary
       verify + commit
       continue/resume/schedule next package
  -> review/test/ship:
       package-aware gates
```

## Data Model

### Task Weight

```yaml
task_weight:
  files_touched: 3
  estimated_loc: 90
  layers: ["service", "test"]
  new_dependencies: 0
  test_scope: "unit"
  risk: "medium"
  estimated_minutes: 8
```

### Atomic Task

```yaml
id: T-04
title: Add package summary parser
dependsOn: [T-02]
task_weight:
  files_touched: 2
  estimated_loc: 80
  layers: ["src", "test"]
  new_dependencies: 0
  test_scope: "unit"
  risk: "low"
  estimated_minutes: 10
verify_command: "npx vitest run test/execution-package-summary.test.ts"
```

### Execution Package

```yaml
execution_packages:
  - id: P1
    name: Plan package model
    tasks: [T-01, T-02, T-03]
    depends_on_packages: []
    boundary_reason: "foundation DAG and parser"
    estimated_loc: 240
    files_touched: 6
    verify_command: "npx vitest run test/plan-package.test.ts"
    handoff_path: ".tinkerman/runs/<run-id>/packages/P1.md"

  - id: P2
    name: Build package execution
    tasks: [T-04, T-05, T-06]
    depends_on_packages: [P1]
    boundary_reason: "depends on package model"
    estimated_loc: 280
    files_touched: 7
    verify_command: "npx vitest run test/build-package.test.ts"
    handoff_path: ".tinkerman/runs/<run-id>/packages/P2.md"
```

### Status Fields

```yaml
mode: "interactive" | "autonomous"
current_package: "P2"
completed_packages: "P1"
next_package: "P3"
package_count: 4
```

These fields are advisory in legacy plans and authoritative when `execution_packages` exists.

## Algorithms

### Atomic Task Gate

1. Parse task seeds from `tasks.md` or plan content.
2. Estimate each task weight from explicit plan metadata, file mapping, task text, and verify scope.
3. Mark a task overweight when any hard threshold is reached:
   - `files_touched >= 5`
   - `estimated_loc >= 150`
   - `layers.length >= 3` without a narrow vertical slice declaration
   - `new_dependencies > 0`
   - `test_scope in ["integration", "e2e", "migration"]`
4. Split overweight tasks into atomic tasks.
5. Recompute dependencies after splitting.

### Dependency Preservation

When task `T` is split into `T-a`, `T-b`, and `T-c`:

- Incoming dependencies to `T` attach to `T-a` unless a child explicitly needs them later.
- `T-b` depends on `T-a` when it consumes `T-a` output.
- `T-c` depends on `T-b` when it completes the behavior.
- Outgoing dependents of `T` depend on the child that produces their required artifact, defaulting to `T-c`.

The resulting graph must pass cycle detection before package generation.

### Package Generation

1. Topologically sort atomic tasks.
2. Start a new package.
3. Add tasks until one of the soft budgets would be exceeded:
   - 3 to 5 tasks
   - 300 estimated LOC
   - 8 touched files
4. Respect hard boundaries:
   - package dependency would point forward
   - high-risk integration/e2e/migration task needs isolation
   - sprint/wave boundary is explicitly marked
5. Compute `depends_on_packages`.
6. Validate every package is reachable and no task is duplicated or omitted.

## Build Execution Flow

```text
/forge build --package P2
  -> read status/config/current package/direct dependency summaries
  -> verify P1 completed
  -> execute tasks in P2 topological order
  -> write .tinkerman/runs/<run>/packages/P2.md
  -> write structured summary
  -> run package verify command
  -> commit
  -> update status current_package/next_package
```

If no package is specified, build selects the first incomplete package. If no `execution_packages` exist, build uses the current legacy task flow.

## Structured Summary Schema

```yaml
status: done | blocked | failed
package_id: P2
tasks_completed: [T-04, T-05]
changed_files:
  items:
    - src/plan-package.ts
    - test/plan-package.test.ts
  overflow_count: 0
commands:
  - cmd: "npx vitest run test/plan-package.test.ts"
    result: pass
    evidence_path: ".tinkerman/runs/<run-id>/packages/P2-verify.log"
findings:
  p0: 0
  p1: 0
  highest_risk: "none"
blockers: []
report_path: ".tinkerman/runs/<run-id>/packages/P2.md"
next_action: "package:P3"
```

The schema is the primary context limiter. A final character cap can reject or truncate malformed summaries, but a well-formed summary should already be small.

## Interactive Mode

Interactive mode keeps the user in the current conversation. Package boundaries are recoverable checkpoints:

1. Persist package summary and status.
2. Continue to the next package when the current context is still usable.
3. Use AskUserQuestion when a real user choice is needed at a package boundary.
4. Resume from files, not chat history.

Interactive mode must not depend on exact context percentage because Forge cannot reliably observe it from the model side.

### AskUserQuestion Discipline

Forge already distinguishes user decision points from automatic phase transitions. Execution packages preserve that rule:

- Normal package completion with a clear next package continues automatically.
- Package split approval, monolith-plan handling, risky continuation after a package boundary, and resume confirmation use AskUserQuestion.
- Plain text such as "run /forge build --package P2" is not an acceptable interactive handoff when Forge can present choices.
- Autonomous mode uses presets and does not ask.

If the runtime does not expose AskUserQuestion, Forge falls back to the existing gated decision protocol with explicit bounded choices. The fallback is only for runtime unavailability; it is not a reason to replace interactive decisions with free-form command instructions.

## Autonomous `/forge loop` Mode

The current project still has `/forge loop` as a Native Fusion Loop skill. It uses `.tinkerman/loop-state.json`, status fields, and native scheduling tools. The package design plugs into that loop:

1. Each loop iteration targets one package.
2. On package success, loop updates state and schedules `/forge loop continue <id>`.
3. On package failure, loop halts or follows three-strike handling.
4. The next iteration starts from fresh context and reads `.tinkerman/` state.

This design does not depend on the removed legacy CLI orchestrator.

## Compatibility With Existing Context Defenses

Execution packages do not replace the existing context defenses. They move the primary control point earlier.

| Existing mechanism | Current role | Interaction with packages |
|---|---|---|
| `forge_read_cached` / Read Dedup | Reduces repeated file reads inside a session | Still applies inside each package. Cache reset across fresh package sessions is acceptable. |
| `forge_exec` / output trimming | Prevents command output bloat | Still preferred for package verify commands and full validation. |
| `track-read-budget.mjs` | Deprecated/advisory read budget tracker | May remain deprecated; package boundaries do not depend on it. If revived, evaluate only at checkpoints. |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Platform-level safety auto-compact | Remains a safety net, not the primary control loop. |
| PreCompact/PostCompact hooks | Snapshot and restore state around compaction | Must include package fields and package progress when present. |
| `/forge resume` | Reconstructs phase/task state from `.tinkerman/` | Must reconstruct current package and next package from package fields. |
| `inject-plan-context.mjs` | Adds plan context to prompts | Must become phase/package aware to avoid re-injecting the full plan. |

The important compatibility rule is: package state must be durable enough for existing compaction and resume flows to recover. If compact fires mid-package, Forge resumes at the current package and task. If compact fires at a package boundary, Forge resumes at the next package.

### Compatibility Findings From Current Project

Current Forge already has useful context defenses, but several are advisory or phase-level rather than package-level:

- `.claude/settings.json` sets `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "60"`. This is a platform safety net, not a Forge-controlled package scheduler.
- `scripts/track-read-budget.mjs` is still registered as a PostToolUse Read hook, but its source marks it deprecated in favor of auto-compact. New package behavior must not depend on it as a hard gate.
- `scripts/hook-precompact.sh` currently snapshots `slug`, `phase`, PR, progress, findings, review summary, and git state. It does not yet snapshot `current_package`, `completed_packages`, `next_package`, package handoff paths, or package-local current task.
- `scripts/hook-postcompact.sh` prints and removes `.tinkerman/.compact-snapshot.md`; therefore any package fields omitted from the snapshot are unavailable to the compact recovery prompt.
- `skills/forge/lib/resume/instructions.md` and `src/resume.ts` implement five-question recovery around task/phase state. Package location must be added either as a sixth field or as part of "当前在哪一步".
- `scripts/inject-plan-context.mjs` supports `--phase`, but the active PreToolUse setting calls it with no explicit phase. It must infer phase and package from `.tinkerman/status.md`; otherwise it can fall back to `extractHead()` and re-inject broad plan context.
- `forge_read_cached` is session-level and TMPDIR-backed. Fresh package sessions may lose cache hits, but package-local bounded context makes that acceptable.

These findings do not conflict with execution packages. They define the implementation work required to make packages the primary prevention layer while compact/resume/read-dedup remain fallback and within-package controls.

## Saved Workflows, Dynamic Workflows, and Ultracode

Claude Code saved workflows are JavaScript orchestration files stored in `.claude/workflows/`. They can define phases, launch agents, run parallel work, validate structured schemas, and return only a synthesized result. This is a better fit for Forge than relying primarily on ad-hoc dynamic workflows because saved workflows are reviewable, versioned, testable, and can be wired into Forge fallback rules.

Claude Code dynamic workflows are a research-preview orchestration mechanism where Claude writes a JavaScript workflow script and the runtime fans work out across many subagents. Official Anthropic material positions workflows for codebase-wide audits, large migrations, and cross-checked research. Dynamic workflows keep intermediate results in the workflow runtime rather than in the conversation, which aligns with Forge's goal of limiting main context growth, but their generated orchestration is less deterministic than a saved project workflow.

Ultracode is not modeled here as a Forge phase or a separate workflow engine. It is treated as a Claude Code effort setting/trigger style that may cause Claude Code to choose dynamic workflows when appropriate. Forge should therefore expose workflow eligibility and package metadata, not hard-code an "ultracode pipeline."

Workflows are useful to this feature, but only as optional phase-internal or package-scoped backends:

- Good fit: package-level migration across many files, package-level audit, adversarial package review, independent verification agents.
- Poor fit: normal small TDD package, tasks requiring user sign-off between internal steps, or Forge phase transitions that require spec/plan/ship approval.
- Hard constraint: workflows have no mid-run user input except permission prompts. Any Forge sign-off must happen before launching the workflow or after it returns.
- Operational constraint: workflows may consume substantially more tokens and can be disabled by user or organization settings.
- Approval constraint: interactive workflow launch uses Claude Code's own approval prompt. Forge must not hide it or assume approval.
- Autonomous constraint: workflow execution is allowed only when the environment explicitly supports non-interactive workflow execution.

### Workflow vs Subagent

Subagent is a single delegated work unit. It is useful for one persona or one isolated task such as `security-check`, `quality-check`, `explore`, or `critic`.

Workflow is an orchestration script that can launch many subagents, run phases, control parallelism, validate schemas, and synthesize results. In Forge, workflow should be the L0 backend for repeatable parallel orchestration, while subagents remain the L1/L2 fallback and the underlying work units.

### Forge Workflow Fit Matrix

| Forge phase | Workflow use | Reason |
|---|---|---|
| `decide` | Strong fit | Product, architecture, security, designer, and critic rounds are already parallel/structured. |
| `spec` | Partial fit | Self-check dimensions can run in parallel; lock and user approval stay in Forge. |
| `plan` | Strong fit for research/audit | Research, file mapping, task weight audit, and package audit can run in parallel; final DAG/package synthesis stays deterministic. |
| `build` | Package-scoped only | TDD and dependencies are order-sensitive; workflow may run package probes, independent package tasks, or package verification. |
| `review` | Strong fit | Multi-layer review is already parallel and independent. Existing `.claude/workflows/multi-agent-review.js` is the prototype. |
| `test` | Partial fit | Unit/type/lint/TODO/AC checks can run independently; final gate verdict stays in Forge. |
| `ship` | Poor fit | Delivery requires AskUserQuestion, merge/PR/discard decisions, and audit semantics. Workflow may only audit gates. |
| `learn` | Strong fit | Five-dimension learning extraction can run in parallel and synthesize into bounded knowledge updates. |

### Saved Workflow Naming

Forge workflows must use stable, Forge-derived names so dispatch code can locate them deterministically:

```text
.claude/workflows/forge-decide.js
.claude/workflows/forge-plan-package.js
.claude/workflows/forge-package-build.js
.claude/workflows/forge-review.js
.claude/workflows/forge-test-gates.js
.claude/workflows/forge-learn.js
```

Generic names are allowed only as temporary experimental files. The current `.claude/workflows/multi-agent-review.js` must be renamed to `.claude/workflows/forge-review.js` before production dispatch uses it. No compatibility alias is required for `multi-agent-review`.

### Dispatch Ladder

Each workflow-capable Forge phase uses the same ladder:

```text
L0 saved workflow available and enabled
  -> run .claude/workflows/forge-<phase>.js or forge-<backend>.js
L1 workflow unavailable or failed
  -> subagent-parallel fallback
L2 subagent parallel unavailable
  -> subagent-serial or single-agent fallback
L3 all legal evaluators unavailable
  -> block only when Forge separation rules require blocking
```

The ladder is especially strict for review: L3 must block ship because the main agent may not replace independent review.

Package execution can expose an optional backend selector:

```yaml
execution_backend:
  kind: "single-agent" | "subagents" | "saved-workflow" | "dynamic-workflow"
  workflow_name: "forge-package-build"
  effort: "normal" | "ultracode"
  workflow_hint: "Use a workflow only for package-level migration verification"
```

The default remains `single-agent` or `subagents` until saved workflow eligibility is proven. Workflow support should be added after package metadata and compatibility gates are implemented.

## Hook Changes

`inject-plan-context.mjs` becomes phase and package aware:

- build: current package details + incomplete package list
- review: package summaries + task titles
- test/ship: package completion table

The hook remains fail-open.

## Review and Ship Gates

Review and ship distinguish:

- package-scoped verdict: one package was reviewed
- feature-scoped verdict: all packages completed and reviewed

Ship output includes a package completion table and blocks or warns on incomplete packages according to gate severity.

## Backward Compatibility

Legacy plans without `execution_packages` continue using existing build behavior. Package-aware code paths activate only when package metadata exists or when plan generation creates it.
