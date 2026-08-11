---
status: completed
feature: runtime-worker-context-control
layout: requirements
created: 2026-06-10
updated: 2026-06-10
tier: full
---
# Requirements Document

## Introduction

Forge standard and full workflows can still exhaust the main Claude Code
conversation because phase execution, review subagents, and verification output
all accumulate as message history. Existing context defenses reduce individual
tool outputs and recover after compaction, but they do not prevent the main
conversation from carrying every phase's detailed execution.

This feature adds an internal Forge runtime that executes phases through bounded
workers and folds results back through durable artifacts and small summaries.
The user-facing entry remains `/forge`; worker orchestration is automatic and
must not introduce a second command surface. The same feature also prevents
source-mode and marketplace-mode configuration drift by making runtime
configuration repairable from a single source of truth.

## Glossary

- **Phase Worker**: An internal worker that executes one Forge phase or package
  and writes durable artifacts under `.tinkerman/`.
- **Subagent Worker**: A worker backed by Claude Code subagents or background
  agents. It is best for review layers, research, and parallel analysis.
- **CLI/SDK Worker**: A worker backed by a command or Claude Agent SDK runner.
  It is best for phase-level isolation, verification, and marketplace-packaged
  runtime execution.
- **Artifact-First Result**: A worker result that stores detailed logs/reports
  on disk and returns only a bounded structured summary to the main context.
- **Source Runtime Mode**: Running Forge directly from a project checkout during
  development.
- **Marketplace Runtime Mode**: Running Forge from a Claude Code marketplace
  plugin bundle.
- **Runtime Shim**: A stable hook/command entry in project settings that
  delegates to Forge runtime source or plugin paths.

## Requirements

### Requirement 1: `/forge` remains the only user-facing workflow entry

**User Story:** As a Forge user, I want worker orchestration to happen behind
`/forge`, so that context control does not require learning extra commands.

#### Acceptance Criteria

1. WHEN a user starts a standard or full workflow, THE runtime SHALL preserve
   the existing `/forge` route and phase order.
2. THE runtime SHALL NOT require the user to manually open another Claude Code
   window for phase isolation.
3. THE runtime SHALL NOT require the user to manually invoke context-mode,
   worker, or sync commands during normal `/forge` execution.
4. Worker orchestration SHALL preserve Forge gates: spec lock, plan approval,
   RED/GREEN/REFACTOR, review separation, verification, ship gates, and learn.

### Requirement 2: Phase workers return artifact-first summaries

**User Story:** As a Forge maintainer, I want every worker to return a small
summary and save details to `.forge`, so the main conversation does not carry
full phase transcripts.

#### Acceptance Criteria

1. A phase worker result SHALL include `phase`, `worker_kind`, `status`,
   `summary`, `artifact_path`, `commands`, `findings`, and `next_action`.
2. `summary` SHALL be bounded by field count and maximum length.
3. `commands` SHALL include at most three command summaries with evidence paths,
   not raw stdout.
4. `findings` SHALL include P0/P1 counts and at most three short items.
5. Detailed logs, reports, raw stdout, and review bodies SHALL be written to
   `.tinkerman/runs/` or `.tinkerman/reviews/` and referenced by path.

### Requirement 3: Subagent workers are supported

**User Story:** As a Forge user running review or analysis phases, I want
subagents to execute detailed work in isolated contexts and return only
structured summaries.

#### Acceptance Criteria

1. THE runtime SHALL support worker kind `subagent`.
2. THE runtime SHALL build a deterministic subagent invocation from phase,
   prompt, workdir, and artifact path.
3. THE subagent prompt SHALL instruct the worker to write its full report to the
   artifact path and return only the bounded summary schema.
4. WHEN the subagent executor returns success, THE runtime SHALL validate and
   normalize the summary.
5. WHEN the subagent executor fails, THE runtime SHALL return a failed summary
   with an artifact path for diagnostics.

### Requirement 4: CLI/SDK workers are supported

**User Story:** As a Forge maintainer, I want a CLI/SDK worker backend so phases
can be isolated even when subagents are not the right execution primitive.

#### Acceptance Criteria

1. THE runtime SHALL support worker kind `cli-sdk`.
2. THE runtime SHALL build deterministic command arguments for the worker.
3. THE command invocation SHALL include phase, run id, project root, artifact
   path, and summary path.
4. WHEN the worker writes a valid summary file, THE runtime SHALL read and
   normalize that summary.
5. WHEN the worker exits without a summary file, THE runtime SHALL return a
   failed summary referencing diagnostic artifacts.

### Requirement 5: Source and marketplace runtime configuration drift is detected

**User Story:** As a Forge maintainer, I want direct source usage and marketplace
usage to stay consistent, so development changes do not silently diverge from
the plugin bundle.

#### Acceptance Criteria

1. THE runtime SHALL detect whether configuration is in source mode or
   marketplace mode.
2. THE drift checker SHALL compare required hook events, runtime shim commands,
   MCP presence, and package manifest references.
3. Missing `PreCompact`, `PostCompact`, `SessionStart`, `UserPromptSubmit`, and
   `Stop` hooks SHALL be reported.
4. Source mode SHALL prefer stable shim commands that delegate to project source.
5. Marketplace mode SHALL prefer plugin-root paths and packaged runtime files.

### Requirement 6: Runtime configuration can be repaired automatically

**User Story:** As a developer working directly in the Forge project, I want
source-mode configuration to update automatically from the current checkout.

#### Acceptance Criteria

1. THE repair operation SHALL add missing Forge-managed hook entries without
   deleting user-managed hooks.
2. Forge-managed entries SHALL carry a stable marker so they can be updated
   safely.
3. THE repair operation SHALL be idempotent.
4. Source mode repair SHALL write source shims that point to project runtime
   files.
5. Marketplace mode repair SHALL not rewrite source-mode paths into user
   projects unless explicitly requested.

### Requirement 7: Runtime sync is publishable through the Claude Code marketplace

**User Story:** As a Forge distributor, I want worker runtime files included in
the plugin bundle, so marketplace remains the primary installation path.

#### Acceptance Criteria

1. Worker runtime scripts SHALL be included in `dist-plugin`.
2. Plugin runtime paths SHALL be expressed through plugin/project environment
   variables where supported.
3. Source-only paths SHALL NOT be required for marketplace operation.
4. `forge doctor` or an equivalent runtime sync check SHALL report missing
   worker runtime assets.
5. Direct source development MAY require a reload for Claude Code runtime
   process changes, but routine source script changes SHALL use source shims.
