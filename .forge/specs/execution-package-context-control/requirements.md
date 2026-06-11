---
status: completed
feature: execution-package-context-control
layout: requirements
created: 2026-06-07
tier: full
---
# Requirements Document

## Introduction

Forge users report that standard and full tier workflows still exhaust context when a plan contains many tasks or when a small task list contains one oversized task. Existing defenses reduce repeated reads, compact state, and recover from compaction, but they do not prevent build from consuming an entire large task set in one continuous context.

This feature moves context control earlier in the workflow. The plan phase must turn the locked spec's task list into atomic tasks and bounded execution packages. Build then executes one package at a time, with state persisted at each package boundary. Interactive mode may continue in the current session or ask the user to resume from a persisted boundary. Autonomous `/forge loop` mode schedules the next package from fresh context.

## Glossary

- **Atomic Task**: A task small enough to implement with one main RED/GREEN/REFACTOR chain, explicit dependencies, and an independent verify command.
- **Overweight Task**: A task that is too large for one atomic build unit because it touches too many files, adds too much code, crosses too many layers, or carries high verification risk.
- **Task DAG**: Directed acyclic graph of task dependencies. Edge `A -> B` means B depends on A.
- **Execution Package**: A bounded group of atomic tasks that build may execute as one unit before writing a package summary, committing, verifying, and optionally starting a fresh context.
- **Package Boundary**: A deterministic recovery point after a package completes or fails. State is stored in `.forge/`, not in conversation history.
- **Structured Summary**: A bounded schema returned by a subagent or package worker. It is limited by fields and semantic content first, with character/token caps only as safety guards.
- **Interactive Mode**: A user-driven `/forge` session where the current Claude Code conversation remains the primary interaction surface.
- **Autonomous Mode**: `/forge loop` mode, where Forge stores loop state and schedules follow-up iterations without waiting for user prompts.
- **PM Requirements-Only Spec**: External product requirements supplied by a product manager that do not include Forge design or tasks.

## Requirements

### Requirement 1: PM requirements-only input is routed through decision and spec synthesis

**User Story:** As a developer receiving a PM requirements document, I want Forge to assess requirement and technical risk before planning tasks, so that unclear or high-risk work does not become a large unstable build plan.

#### Acceptance Criteria

1. WHEN the user provides a PM requirements-only spec and the work includes new service, database, auth, cross-module, security, or ambiguous scope signals, THE router SHALL select full tier and run `decide -> spec -> plan -> build -> review -> test -> ship -> learn`.
2. WHEN the PM requirements-only spec is clear and has no full-tier risk signals, THE router MAY select standard tier, but THE spec phase SHALL still import or synthesize Forge `requirements.md`, `design.md`, and `tasks.md` before plan approval.
3. THE decide phase SHALL assess whether the PM spec is sufficient, identify product, architecture, and security decisions, and write those decisions to `.forge/decisions/`.
4. THE decide phase SHALL NOT generate execution packages, task-level RED/GREEN/REFACTOR steps, or package boundaries.
5. THE spec phase SHALL import the PM requirements and synthesize missing design and task seed information before lock.

### Requirement 2: Plan computes task weights and blocks overweight tasks

**User Story:** As a Forge user, I want plan to detect a single oversized task even when the total task count is small, so that one task cannot exhaust the build context.

#### Acceptance Criteria

1. THE plan phase SHALL compute a `task_weight` for every task with at least: `files_touched`, `estimated_loc`, `layers`, `new_dependencies`, `test_scope`, `risk`, and `estimated_minutes`.
2. WHEN `files_touched >= 5`, THE task SHALL be classified as overweight.
3. WHEN `estimated_loc >= 150`, THE task SHALL be classified as overweight.
4. WHEN `layers` contains 3 or more architectural layers, THE task SHALL be classified as overweight unless it is explicitly a narrow vertical slice with one main behavior.
5. WHEN `new_dependencies > 0`, THE dependency decision or installation work SHALL be isolated into its own infrastructure or decision task before feature implementation tasks.
6. WHEN `test_scope` includes `integration`, `e2e`, or `migration`, THE task SHALL be classified as high-risk and either split or isolated into a package with no unrelated work.
7. WHEN a task is overweight, THE plan phase SHALL split it into smaller atomic tasks before approval.
8. THE `monolith_acknowledged` frontmatter field SHALL NOT bypass overweight task splitting.

### Requirement 3: Plan preserves task dependency correctness during splitting

**User Story:** As a developer executing a split plan, I want all task dependencies preserved after task splitting, so that packages execute in a valid order and build never starts a dependent task too early.

#### Acceptance Criteria

1. THE plan phase SHALL build a Task DAG from every task's `dependsOn` metadata before package generation.
2. WHEN an overweight task is split into child tasks, THE child tasks SHALL inherit incoming dependencies from the original task unless the plan explicitly assigns them to only the first child.
3. WHEN an overweight task is split into child tasks, THE original task's outgoing dependents SHALL depend on the last child task or on the child task that produces the required artifact.
4. THE plan phase SHALL validate that the resulting Task DAG has no cycles.
5. THE package generator SHALL process tasks in topological order.
6. A package MAY contain dependent tasks, but build SHALL execute those tasks in package-local topological order.
7. A package SHALL NOT depend on a later package.
8. Every package SHALL declare `depends_on_packages`.

### Requirement 4: Plan generates bounded execution packages

**User Story:** As a Forge user with a large task set, I want plan to group atomic tasks into bounded execution packages, so that build has deterministic context boundaries.

#### Acceptance Criteria

1. WHEN the atomic task count is 10 or more, THE plan phase SHALL generate `execution_packages`.
2. WHEN the atomic task count is 6 to 9, THE plan phase SHOULD generate `execution_packages` based on dependency, wave, or sprint boundaries.
3. WHEN the atomic task count is 5 or fewer and no task is overweight, THE plan phase MAY generate a single package.
4. Each package SHOULD contain 3 to 5 atomic tasks unless dependency boundaries or risk isolation require fewer.
5. Each package SHOULD have `estimated_loc <= 300`.
6. Each package SHOULD have `files_touched <= 8`.
7. Each package SHALL include `id`, `name`, `tasks`, `depends_on_packages`, `boundary_reason`, `verify_command`, and `handoff_path`.
8. WHEN a package exceeds the recommended limits, THE plan SHALL record the reason and risk in the package metadata.
9. `monolith_acknowledged` MAY bypass splitting one plan into multiple plans, but SHALL NOT bypass execution package generation.

### Requirement 5: Build executes one package at a time

**User Story:** As a Forge user, I want build to consume only the current execution package, so that the active context does not accumulate the full plan's task details.

#### Acceptance Criteria

1. THE build phase SHALL accept a package selector such as `--package <id>` or infer the next incomplete package from `.forge/status.md` and `.forge/progress/`.
2. THE build phase SHALL load only the current package, its direct dependencies' summaries, status, config, and required task details.
3. THE build phase SHALL NOT load full completed task histories unless a failure requires inspection.
4. Before executing a package, build SHALL verify all `depends_on_packages` are completed.
5. After package success, build SHALL write a package summary to the package `handoff_path`.
6. After package success, build SHALL update `.forge/status.md` with `current_package`, `completed_packages`, and `next_package`.
7. After package success, build SHALL run the package `verify_command` and record evidence.
8. After package success, build SHALL create an atomic commit or record why a commit was intentionally skipped.
9. When all packages complete, build SHALL run the configured full validation command before auto-advancing to review.

### Requirement 6: Package and subagent summaries use schema-first limits

**User Story:** As a Forge maintainer, I want package worker summaries to be semantically bounded rather than only character bounded, so that important information is retained without flooding context.

#### Acceptance Criteria

1. THE package worker or subagent final response SHALL conform to a structured summary schema containing: `status`, `package_id`, `tasks_completed`, `changed_files`, `commands`, `findings`, `blockers`, `report_path`, and `next_action`.
2. THE `changed_files` field SHALL list at most 5 paths and include an overflow count when more files changed.
3. THE `commands` field SHALL list at most 3 commands with command name, result, and evidence path, not raw output.
4. THE `findings` field SHALL include P0/P1 counts and the highest risk summary only.
5. THE `blockers` field SHALL include at most 3 blockers, each with a short reason and evidence path.
6. Complete raw logs, diffs, and detailed reports SHALL be written to `.forge/runs/` or `.forge/progress/` and referenced by `report_path`.
7. A final character or token cap MAY be applied as a safety guard, but field-level semantic limits SHALL be the primary constraint.

### Requirement 7: Interactive mode uses package boundaries as recoverable checkpoints

**User Story:** As a user working interactively, I want package boundaries to be safe stopping points, so that I can compact or resume without losing task state.

#### Acceptance Criteria

1. In interactive mode, package completion SHALL persist status, progress, verify evidence, and handoff before continuing.
2. In interactive mode, build MAY continue to the next package in the same session when context risk is low.
3. In interactive mode, build MAY recommend `/compact` or `/forge resume` at package boundaries, but SHALL NOT rely on reading exact context window percentage.
4. In interactive mode, if build stops at a package boundary, the user SHALL be able to resume with `/forge resume` or `/forge build --package <next>`.
5. The resume flow SHALL use `.forge/status.md` and package handoff files rather than conversation history.

### Requirement 8: Autonomous `/forge loop` executes packages from fresh context

**User Story:** As a user running `/forge loop`, I want each package to run as a fresh-context iteration, so that long workflows can complete without context rot.

#### Acceptance Criteria

1. WHEN `/forge loop` runs a build with execution packages, THE loop SHALL execute at most one package per iteration.
2. THE loop SHALL store `mode: "autonomous"`, `loop_run_id`, `current_package`, `completed_packages`, and `skill_sequence` in Forge state.
3. After a package succeeds, THE loop SHALL schedule the next iteration using native scheduling (`ScheduleWakeup` or `CronCreate`) with a prompt that targets the next package.
4. On resume, THE loop SHALL read `.forge/loop-state.json`, `.forge/status.md`, and package handoff files to determine the next package.
5. The loop SHALL stop and preserve state when a package fails, is blocked, or triggers three-strike.
6. The loop SHALL not depend on the removed legacy `forge-loop-cli` or `persistent-loop.sh` as the primary orchestrator.

### Requirement 9: Phase-aware plan context injection is package-aware

**User Story:** As a Forge user, I want automatic plan context injection to include only the active package, so that hook-provided context does not reintroduce the full task list.

#### Acceptance Criteria

1. THE plan context injection hook SHALL detect the current phase from `.forge/status.md`.
2. During build, THE hook SHALL inject only the current package and incomplete package titles, not completed task histories.
3. During review, THE hook SHALL inject package summaries and task titles, not full build details.
4. During test and ship, THE hook SHALL inject only progress summaries and package completion status.
5. The hook SHALL fail open when status or package metadata is missing.

### Requirement 10: Review and ship gates understand package completion

**User Story:** As a reviewer, I want review and ship to know whether all packages are complete, so that partial package completion cannot be shipped as a completed feature.

#### Acceptance Criteria

1. THE review phase SHALL check that every execution package is completed before issuing a full-feature pass verdict.
2. THE review phase MAY run package-level review for an individual package, but SHALL label the verdict as package-scoped.
3. THE test phase SHALL include package verification evidence in its input summary.
4. THE ship phase SHALL block or warn when any execution package is incomplete according to the configured severity.
5. THE final ship artifact SHALL include a package completion table.

### Requirement 11: User decisions use AskUserQuestion instead of free-form command prompts

**User Story:** As an interactive Forge user, I want Forge to guide required choices through Claude Code's interactive question UI, so that I do not have to infer or manually type the next command.

#### Acceptance Criteria

1. WHEN a Forge step requires user confirmation, THE step SHALL use Claude Code AskUserQuestion or the project-equivalent interactive question mechanism.
2. Forge SHALL NOT satisfy a required user decision by only printing a command such as "run `/forge build --package P2`".
3. WHEN AskUserQuestion is unavailable in the current runtime, THE step SHALL record the unavailable mechanism and fall back to the existing gated decision protocol; this fallback SHALL still present bounded choices and SHALL NOT silently auto-approve interactive decisions.
4. WHEN package generation detects `tasks >= 10`, THE plan phase SHALL present the package structure during plan approval and ask the user to approve, modify, or reject using AskUserQuestion.
5. WHEN plan detects a monolith-plan split recommendation, THE choice between "split plan" and "keep single plan with execution packages" SHALL use AskUserQuestion.
6. WHEN an overweight task requires splitting and multiple split strategies are valid, THE plan phase SHALL use AskUserQuestion to choose the split strategy or request modification.
7. WHEN interactive build reaches a package boundary and determines that continuing in the same session is risky, THE next action SHALL be selected with AskUserQuestion. Choices SHALL include continuing in-session, compact-and-resume guidance, or stopping at the saved package boundary.
8. WHEN `/forge resume` locates an incomplete package and requires user confirmation, it SHALL use AskUserQuestion rather than plain text instructions.
9. AskUserQuestion SHALL NOT be used between normal package-to-package transitions when no decision is needed; no-mid-step-confirmation remains in force.
10. Autonomous mode SHALL use configured presets instead of AskUserQuestion.

### Requirement 12: Existing context defenses remain compatible and layered

**User Story:** As a Forge maintainer, I want execution packages to complement existing context defenses, so that prior compact, read-cache, and resume behavior does not regress.

#### Acceptance Criteria

1. THE package design SHALL treat execution packages as the primary prevention layer and existing context compression mechanisms as fallback/recovery layers.
2. `forge_read_cached` and Read Dedup rules SHALL remain valid inside each package session.
3. WHEN a new session starts for a later package, read-cache state MAY reset; this SHALL NOT be treated as a package failure.
4. PreCompact and PostCompact hooks SHALL include package fields (`current_package`, `completed_packages`, `next_package`) in their snapshots when present.
5. WHEN compaction occurs mid-package, resume SHALL recover to the current package and current task using `.forge/status.md`, `.forge/progress/`, and interim package state.
6. Existing `/forge resume` five-question recovery SHALL add package location as a sixth package-aware field or include it in "当前在哪一步".
7. Existing context budget warnings SHALL be evaluated at task or package checkpoints. They SHALL NOT force an unsafe mid-write interruption.
8. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` and platform auto-compact SHALL remain optional safety mechanisms; the package protocol SHALL NOT require exact context usage percentages.
9. Legacy plans without `execution_packages` SHALL continue using existing compact/resume behavior.
10. The PreToolUse plan-context hook SHALL derive phase/package from `.forge/status.md` when invoked without explicit `--phase`, because current settings call `scripts/inject-plan-context.mjs` without a phase argument.
11. The implementation SHALL NOT make deprecated `scripts/track-read-budget.mjs` a hard dependency; it MAY remain advisory while package boundaries provide deterministic prevention.
12. The implementation SHALL preserve the existing anti-manual-handoff rule: when context exhaustion recovery is triggered, Forge writes state and invokes resume rather than asking the user to type commands.
13. The spec implementation SHALL include a compatibility audit test or document proving no conflict with: `forge_read_cached`, Read Dedup rules, `track-read-budget` deprecation status, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, PreCompact/PostCompact hooks, `inject-plan-context.mjs`, `/forge resume`, and legacy plans without packages.

### Requirement 13: Saved workflows are optional phase/package execution backends

**User Story:** As a Forge user with access to Claude Code workflows, I want Forge to use saved workflows where they help phase or package execution, without replacing Forge's deterministic gates and approvals.

#### Acceptance Criteria

1. THE package protocol SHALL support Claude Code saved workflows in `.claude/workflows/` as optional execution backends for phase-internal or package-scoped work.
2. Saved workflows SHALL be preferred over ad-hoc dynamic workflows for repeatable Forge orchestration because their prompts, schemas, concurrency, and fallback behavior are reviewable in the repository.
3. Dynamic workflows and ultracode MAY remain available as exploratory or effort-triggered backends, but they SHALL NOT be the primary Forge implementation path for this feature.
4. Ultracode SHALL be treated as a Claude Code effort setting that lets Claude decide whether to use dynamic workflows, not as a separate Forge workflow engine.
5. Workflows SHALL NOT replace Forge phase routing, spec lock, plan approval, TDD enforcement, review gates, test gates, ship gates, or AskUserQuestion decisions.
6. In interactive mode, starting a workflow SHALL respect Claude Code's workflow approval prompt and Forge SHALL not hide or bypass that approval.
7. In autonomous mode, workflow use SHALL be allowed only when the environment supports workflows, workflows are enabled by user/org settings, and permissions are configured for non-interactive execution.
8. A package execution workflow SHALL target at most one execution package unless the package plan explicitly marks a multi-package workflow as safe.
9. Workflow intermediate results SHALL be treated as external to the main conversation and folded back only through the package summary schema and report files.
10. Workflows SHALL be preferred for `decide` multi-perspective analysis, `plan` research and package audit, package-level build probes or independent package tasks, `review` multi-layer review, `test` independent verification gates, and `learn` multi-dimension extraction.
11. Workflows SHALL be avoided for `ship` delivery decisions, small packages, HITL-heavy tasks, and tasks requiring user sign-off between internal steps.
12. If workflows are disabled or unavailable, Forge SHALL fall back to normal package execution with subagents or single-agent build.
13. Forge workflow files SHALL use stable names derived from Forge subcommands or package backend names, such as `forge-review.js`, `forge-decide.js`, `forge-plan-package.js`, `forge-package-build.js`, `forge-test-gates.js`, and `forge-learn.js`.
14. Existing workflow files with generic names, including `.claude/workflows/multi-agent-review.js`, SHALL be renamed to a stable Forge workflow name before becoming part of the dispatch path; compatibility aliases are not required.
15. Workflow dispatch SHALL include a fallback ladder: saved workflow L0, subagent-parallel L1, subagent-serial or single-agent L2, unavailable/blocking L3 when review/decision separation would be violated.
