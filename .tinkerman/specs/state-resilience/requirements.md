---
status: completed
feature: state-resilience
layout: requirements
created: 2026-05-01
tier: standard
---
# Requirements Document

## Introduction

Forge 的每个阶段都依赖前一阶段写入的状态文件（`.tinkerman/status.md`、`.tinkerman/progress/`、`.tinkerman/reviews/` 等）。当状态文件格式不对、frontmatter 缺字段、或 phase 值不在预期范围内时，流程会卡住或行为不确定。

对比 addyosmani/agent-skills 的无状态设计（每个 skill 独立执行，不依赖其他 skill 的输出），Forge 的有状态架构需要更强的容错能力。本改进为 Forge 的状态系统增加三层防御：宽容解析（缺失字段用默认值）、降级执行（前置文件缺失时跳过依赖检查）、状态自愈（从 git log 和文件系统重建不一致的状态）。

**明确不做的事情**：不改变正常流程的行为（容错只在异常情况下触发）；不自动修复磁盘上的状态文件（只重建内存中的状态）；不降低质量标准（降级模式输出警告，不跳过门禁）。

## Requirements

### Requirement 1: 状态文件宽容解析

**User Story:** As a Forge Loop user, I want state file parsing to handle missing or malformed fields gracefully, so that a single missing field doesn't crash the entire workflow.

#### Acceptance Criteria

1. THE `src/state.ts` module SHALL define a default value for every field in StatusFile frontmatter: `current_task` → `""`, `tier` → `"standard"`, `phase` → `"router"`, `task_type` → `"fullstack"`, `project_phase` → `"iteration"`, `hints` → `""`, `assumptions` → `[]`, `mode` → `"interactive"`.
2. WHEN a StatusFile field is missing or cannot be parsed, THE parser SHALL use the default value and emit a warning message (not throw an error).
3. WHEN the entire StatusFile is missing or unparseable, THE parser SHALL return a complete default StatusFile object and emit a warning.
4. ALL existing state.ts tests SHALL continue to pass — the defaults only apply when fields are missing, not when they are present.

### Requirement 2: Review 报告宽容解析

**User Story:** As a developer, I want review report parsing to handle missing fields, so that a malformed review report doesn't block the ship gate.

#### Acceptance Criteria

1. THE review report parser SHALL define defaults for: `result` → `"incomplete"`, `p0_count` → `0`, `p1_count` → `0`, `p2_count` → `0`, `p3_count` → `0`, `reviewed_at_commit` → `undefined`.
2. WHEN a review report field is missing, THE parser SHALL use the default and emit a warning.
3. WHEN `result` defaults to `"incomplete"`, THE ship gate SHALL treat it as a blocking condition (incomplete ≠ pass), which is the safe default.

### Requirement 3: Skill Scheduler 降级执行

**User Story:** As a Forge Loop user, I want the skill scheduler to continue operating when prerequisite files are missing, so that a missing progress file doesn't permanently block the workflow.

#### Acceptance Criteria

1. THE `src/skill-scheduler.ts` `determineNextSkill` function SHALL handle `undefined` values for all optional input fields (`planStatus`, `hasIncompleteTasks`, `reviewResult`, `testPassed`) by treating them as "not yet determined" rather than errors.
2. WHEN `hasIncompleteTasks` is `undefined` (progress file missing), THE scheduler SHALL assume tasks are incomplete and stay in the current build phase, emitting a warning.
3. WHEN `reviewResult` is `undefined` (review report missing), THE scheduler SHALL stay in the review phase, emitting a warning.
4. THE scheduler SHALL NEVER transition to a later phase based on missing data — missing data always means "stay in current phase" or "go to earlier phase", never "skip ahead".

### Requirement 4: Config 文件容错

**User Story:** As a developer, I want Forge to work with a minimal or damaged config.md, so that a config parsing error doesn't block all operations.

#### Acceptance Criteria

1. THE config parser SHALL define defaults for all config fields: `project` → `"unknown"`, `stack` → `["TypeScript"]`, `security_level` → `1`, `knowledge_limit` → `20`, `max_parallel_agents` → `6`.
2. WHEN `.tinkerman/config.md` is missing or unparseable, THE parser SHALL use the complete default config and emit a warning.
3. WHEN individual config fields are missing, THE parser SHALL use per-field defaults.

### Requirement 5: 状态自愈（从 git 重建）

**User Story:** As a Forge Loop user, I want Forge to attempt state reconstruction from git history when state files are inconsistent, so that interrupted runs can be recovered without manual intervention.

#### Acceptance Criteria

1. THE `src/status-resolver.ts` (new or extended) SHALL export a `reconstructStateFromGit(gitLog: string[], forgeFiles: string[])` pure function.
2. THE function SHALL infer the current phase from: presence of `.tinkerman/plans/` files (→ at least plan phase), presence of `.tinkerman/progress/` files with completed tasks (→ at least build phase), presence of `.tinkerman/reviews/` files (→ at least review phase).
3. THE function SHALL return a `ReconstructedState` object with `inferredPhase`, `confidence` (high/medium/low), and `evidence` (list of files/commits used for inference).
4. THE function SHALL be called by `forge-resume` when StatusFile is missing or inconsistent, NOT automatically during normal flow.
5. THE reconstructed state SHALL NOT be written to disk automatically — it SHALL be presented to the user for confirmation.
