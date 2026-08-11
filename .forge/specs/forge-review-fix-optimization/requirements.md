---
status: completed
feature: forge-review-fix-optimization
layout: requirements
created: 2026-04-29
tier: standard
status_note: "Req1–5 (context budget serializers), Req6 (Backlog_Manager wired: plan Step 2.5 surfaces overlapping backlog entries via findOverlappingEntries; ship Gate 4b captures unfixed P2/P3 via appendToBacklog with auto-dedup + auto-create + date/originTask tags), Req7 (Knowledge accumulation: learn.ts buildPatternUpgradeDrafts + findUpgradableEpisodes promote at ≥3 observations with confidence [0.3,0.9]; maintainKnowledgeBase enforces 20-doc cap + auto-cleans confidence<0.3; solutions/*.md + metrics.md + known-failures.md all present and cataloged), Req8 (status-manager multi-task), Req9–11 (fix-checklist F-NNN + incremental-verifier + fix-recovery), Req12 (ci_check_command referenced 4× build + 3× test + config.md), Req13–14 (context budget + ContextBudgetReport), Req15 (zod enum validation) all delivered. R7 trigger fires on /forge learn invocation per R7.1's own wording (WHEN /forge learn executes)."
---
# Requirements Document

## Introduction

This specification addresses six pain points discovered through dogfooding the Forge AI coding workflow framework. The problems span context window consumption, P2/P3 issue tracking, knowledge accumulation, parallel task support, review-fix cycle cost, and CI command discovery. Together, these issues degrade the developer experience and limit Forge's ability to complete standard-path workflows reliably within a single session.

The feature name "forge-review-fix-optimization" reflects the central theme: reducing the cost and friction of the review → fix → re-review → ship cycle, while also addressing the systemic issues (context pressure, knowledge gaps, parallel work) that compound that cost.

## Glossary

- **Context_Window**: The token-limited working memory available to the AI agent during a session. All tool outputs, agent results, and conversation history consume tokens from this budget.
- **Context_Budget_Manager**: The module (`src/context-budget.ts`) responsible for serializing and deserializing structured summaries to reduce context window consumption.
- **Standard_Path**: The Forge workflow tier consisting of `plan → build → review → test → ship` command sequence.
- **Full_Path**: The Forge workflow tier consisting of `decide → spec → plan → build → review → test → ship → learn` command sequence.
- **Review_Agent_Team**: The set of three independent review subagents: spec-check, quality-check, and security-check.
- **Severity_Level**: The priority classification for review findings: P0 (blocks release), P1 (must fix before release), P2 (should fix, negotiable timing), P3 (suggestion, developer decides).
- **Incremental_Verifier**: A lightweight verification mechanism that checks only the specific code changed by a P1 fix, rather than triggering a full three-layer re-review.
- **P1_Fix_Checklist**: A real-time tracking document that records the status of each P1 finding (unfixed, in-progress, fixed, verified) throughout the review-fix cycle.
- **Backlog_File**: A persistent file (`.forge/backlog.md`) that captures P2/P3 findings not addressed in the current release cycle.
- **Knowledge_Base**: The collection of files under `.forge/knowledge/` that store accumulated project experience, including `instincts.md`, `known-failures.md`, `evolved-rules.md`, and `metrics.md`.
- **Status_File**: The file `.forge/status.md` that tracks the current task, tier, and phase of a Forge workflow execution.
- **Worktree**: A Git worktree that allows parallel development of multiple features in isolated working directories.
- **Explore_Summarizer**: The component that compresses Explore agent output into structured summaries for context budget management.
- **Review_Summarizer**: The component that compresses review report output into findings-only summaries for context retention.
- **Test_Output_Trimmer**: The component that compresses test runner output to retain only failure details and summary statistics.
- **Git_Output_Limiter**: The component that compresses git diff and status output when they exceed size thresholds.
- **Subagent_Summary_Protocol**: The structured format that subagents use to return results to the orchestrating agent.
- **Restatement_Checkpoint**: A periodic context refresh mechanism that summarizes accumulated state to combat attention decay in long sessions.
- **SKILL_Document**: A markdown file defining the behavior, steps, and constraints for a specific Forge command (e.g., `forge-build/SKILL.md`).
- **CI_Check_Command**: The project-defined command(s) in `.forge/config.md` that run the full CI validation suite.

## Requirements

### Requirement 1: Context Window Token Reduction for Explore Agent Output

**User Story:** As a developer using Forge, I want the Explore agent to return compressed summaries instead of full file paths and code snippets, so that context window consumption is reduced by approximately 90% per exploration.

#### Acceptance Criteria

1. WHEN the Explore agent completes a codebase exploration, THE Explore_Summarizer SHALL produce a structured summary containing entry points, dependency chains, related tests, and key interfaces.
2. THE Explore_Summarizer SHALL produce output that does not exceed 300 tokens as estimated by character count divided by 4.
3. WHEN the Explore agent returns results containing more than 5 files, THE Explore_Summarizer SHALL group files by module or directory rather than listing them individually.
4. THE Explore_Summarizer SHALL preserve file path and line number for each entry point in the summary.
5. IF the Explore agent returns an error or empty result, THEN THE Explore_Summarizer SHALL pass through the error message without transformation.
6. FOR ALL valid Explore summaries, serializing then deserializing SHALL produce an equivalent object (round-trip property).

### Requirement 2: Context Window Token Reduction for Review Reports

**User Story:** As a developer using Forge, I want review reports to retain only the findings list in context while persisting full analysis to disk, so that three-reviewer output consumes approximately 300 tokens instead of 3000.

#### Acceptance Criteria

1. WHEN a review subagent completes its analysis, THE Review_Summarizer SHALL write the full review report to `.forge/reviews/<topic>-<reviewer>.md`.
2. THE Review_Summarizer SHALL retain in context only a findings summary containing severity counts and a one-line description per finding with file path reference.
3. THE Review_Summarizer SHALL produce a context-retained summary that does not exceed 400 tokens as estimated by character count divided by 4.
4. WHEN a review produces zero findings, THE Review_Summarizer SHALL output a single confirmation line instead of an empty findings table.
5. FOR ALL valid Review summaries, serializing then deserializing SHALL produce an equivalent object (round-trip property).

### Requirement 3: Context Window Token Reduction for Test Output

**User Story:** As a developer using Forge, I want test runner output to be trimmed to only failure details and summary statistics, so that passing test suites consume minimal context tokens.

#### Acceptance Criteria

1. WHEN all tests pass, THE Test_Output_Trimmer SHALL produce a single summary line containing total count, pass count, fail count, skip count, and duration.
2. WHEN tests fail, THE Test_Output_Trimmer SHALL retain only the failing test names, assertion error messages, and file locations, omitting all passing test details.
3. WHEN all tests pass, THE Test_Output_Trimmer SHALL produce output that does not exceed 150 tokens as estimated by character count divided by 4.
4. THE Test_Output_Trimmer SHALL support vitest output format as the primary test runner.
5. IF the test runner output cannot be parsed, THEN THE Test_Output_Trimmer SHALL retain the original output without modification and log a warning.
6. FOR ALL valid Test output summaries, serializing then deserializing SHALL produce an equivalent object (round-trip property).

### Requirement 4: Context Window Token Reduction for Git Output

**User Story:** As a developer using Forge, I want git diff and status output to be compressed when they exceed size thresholds, so that large changesets do not dominate the context window.

#### Acceptance Criteria

1. WHEN a git diff exceeds 50 lines, THE Git_Output_Limiter SHALL produce a file-level summary showing each changed file with its added and removed line counts.
2. WHEN a git diff is 50 lines or fewer, THE Git_Output_Limiter SHALL pass through a simplified representation of the diff.
3. WHEN a git status lists more than 30 files, THE Git_Output_Limiter SHALL produce a category summary (staged, modified, untracked) with at most 10 files per category.
4. WHEN a git status lists 30 files or fewer, THE Git_Output_Limiter SHALL pass through a simplified representation of the status.
5. THE Git_Output_Limiter SHALL preserve the full diff in a temporary file and include the file path in the summary for on-demand access.
6. FOR ALL valid Git diff and status summaries, serializing then deserializing SHALL produce an equivalent object (round-trip property).

### Requirement 5: Context Window Token Reduction for Subagent Results

**User Story:** As a developer using Forge, I want subagent results to follow a structured summary protocol instead of returning full execution logs, so that each subagent result consumes approximately 150 tokens instead of 1500.

#### Acceptance Criteria

1. THE Subagent_Summary_Protocol SHALL define a structured result format containing: status, task description, changed files list, test result summary, commit reference, and self-check results.
2. THE Subagent_Summary_Protocol SHALL produce output that does not exceed 200 tokens as estimated by character count divided by 4.
3. WHEN a subagent reports BLOCKED or NEEDS_CONTEXT status, THE Subagent_Summary_Protocol SHALL include a blocking reason field.
4. WHEN a subagent reports DONE_WITH_CONCERNS status, THE Subagent_Summary_Protocol SHALL include a concerns field.
5. THE Subagent_Summary_Protocol SHALL be referenced consistently across forge-build, forge-review, and forge-decide SKILL documents.
6. FOR ALL valid Subagent summaries, serializing then deserializing SHALL produce an equivalent object (round-trip property).

### Requirement 6: P2/P3 Issue Backlog Capture

**User Story:** As a developer using Forge, I want P2 and P3 review findings to be automatically captured in a backlog file when they are not fixed before ship, so that they are not lost after the current release cycle.

#### Acceptance Criteria

1. WHEN `/forge ship` executes and unfixed P2 or P3 findings exist in the review reports, THE Backlog_Manager SHALL append those findings to `.forge/backlog.md` with source review reference, severity, file path, and one-line description.
2. THE Backlog_Manager SHALL not create duplicate entries for findings already present in `.forge/backlog.md`.
3. WHEN `/forge plan` executes for a new task, THE Backlog_Manager SHALL surface any backlog entries whose file paths overlap with the files affected by the new plan.
4. THE Backlog_Manager SHALL tag each backlog entry with the date it was captured and the originating task name.
5. WHEN a backlog entry is resolved in a subsequent task, THE Backlog_Manager SHALL mark the entry as resolved with the resolving task name and date.
6. IF `.forge/backlog.md` does not exist when a capture is triggered, THEN THE Backlog_Manager SHALL create the file with a standard header.

### Requirement 7: Knowledge Accumulation Activation

**User Story:** As a developer using Forge, I want the knowledge accumulation system to actually capture and persist experience data after each completed task, so that future tasks benefit from historical patterns.

#### Acceptance Criteria

1. WHEN `/forge learn` executes after a completed Standard_Path or Full_Path workflow, THE Knowledge_Extractor SHALL extract data across five dimensions: problem patterns, solutions, pitfalls, decision rationale, and reusable patterns.
2. THE Knowledge_Extractor SHALL write extracted knowledge to `.forge/knowledge/solutions/<topic>.md` with structured fields for each dimension.
3. WHEN a knowledge entry's pattern has been observed 3 or more times, THE Knowledge_Extractor SHALL promote the pattern to `.forge/knowledge/instincts.md` with a confidence score between 0.3 and 0.9.
4. WHEN `/forge plan` or `/forge build` executes, THE Knowledge_Retriever SHALL search the Knowledge_Base for entries relevant to the current task and include matching entries in the agent context.
5. THE Knowledge_Extractor SHALL update `.forge/knowledge/metrics.md` with session statistics including command usage counts, routing accuracy, and execution quality metrics.
6. THE Knowledge_Extractor SHALL update `.forge/knowledge/known-failures.md` when a debug session identifies a recurring failure pattern.
7. IF the Knowledge_Base exceeds the configured knowledge limit (default 20 documents), THEN THE Knowledge_Extractor SHALL remove the document with the lowest confidence score.

### Requirement 8: Parallel Task Status Tracking

**User Story:** As a developer using Forge, I want to run multiple Forge tasks in parallel across different worktrees without status file conflicts, so that parallel development workflows are supported.

#### Acceptance Criteria

1. THE Status_Manager SHALL support tracking multiple concurrent tasks, each identified by a unique task name or worktree identifier.
2. WHEN a new Forge task starts in a worktree, THE Status_Manager SHALL create or update a task-specific status entry without overwriting entries for other active tasks.
3. WHEN `/forge resume` executes, THE Status_Manager SHALL list all active task entries and allow the user to select which task to resume.
4. THE Status_Manager SHALL detect and warn when two worktrees attempt to modify the same task entry concurrently.
5. WHEN a task completes or is aborted, THE Status_Manager SHALL remove its entry from the active task list.
6. THE Status_Manager SHALL maintain backward compatibility with the existing single-task `.forge/status.md` format by migrating to the multi-task format on first multi-task use.

### Requirement 9: Incremental P1 Fix Verification

**User Story:** As a developer using Forge, I want P1 fixes to be verified incrementally rather than triggering a full three-layer re-review, so that the review-fix cycle cost is proportional to the fix size.

#### Acceptance Criteria

1. WHEN a P1 fix modifies fewer than 50 lines of code, THE Incremental_Verifier SHALL verify only the changed lines against the original finding rather than triggering a full three-layer review.
2. THE Incremental_Verifier SHALL check that the specific issue described in the P1 finding is addressed by the fix, using the finding's file path, line number, and description as verification criteria.
3. WHEN the Incremental_Verifier confirms a fix, THE P1_Fix_Checklist SHALL update the finding status from "in-progress" to "verified".
4. WHEN a P1 fix modifies 50 or more lines of code, THE Incremental_Verifier SHALL escalate to a targeted single-layer review (only the layer that raised the finding) rather than a full three-layer review.
5. IF the Incremental_Verifier cannot confirm that a fix addresses the original finding, THEN THE Incremental_Verifier SHALL report the verification failure with a specific explanation of what remains unresolved.

### Requirement 10: Real-Time P1 Fix Checklist Tracking

**User Story:** As a developer using Forge, I want a real-time checklist that tracks the status of every P0 and P1 finding throughout the review-fix-ship cycle, so that no critical issue is lost or discovered late.

#### Acceptance Criteria

1. WHEN `/forge review` completes, THE P1_Fix_Checklist SHALL be created at `.forge/reviews/<topic>-checklist.md` containing every P0 and P1 finding with status "unfixed".
2. WHILE the review-fix cycle is active, THE P1_Fix_Checklist SHALL be updated in real-time as fixes are applied, with status transitions: unfixed → in-progress → fixed → verified.
3. WHEN `/forge ship` is invoked, THE Ship_Gate SHALL read the P1_Fix_Checklist and block shipping if any P0 or P1 entry has a status other than "verified".
4. THE P1_Fix_Checklist SHALL include for each entry: finding ID, severity, file path, one-line description, current status, and the commit hash of the fix (when applicable).
5. IF a previously fixed P1 is detected as regressed (e.g., the fix commit was reverted or overwritten), THEN THE P1_Fix_Checklist SHALL revert the entry status to "unfixed" and log a warning.

### Requirement 11: Automatic Fix Recovery from Git History

**User Story:** As a developer using Forge, I want Forge to automatically detect and recover fixes from git commit history when fix tracking state is lost, so that manual recovery from git history is eliminated.

#### Acceptance Criteria

1. WHEN `/forge resume` or `/forge ship` detects a P1 finding marked as "unfixed" in the checklist, THE Fix_Recovery_Engine SHALL scan git log for commits that modify the finding's file path and line range.
2. WHEN a matching commit is found that addresses the finding's file and line range, THE Fix_Recovery_Engine SHALL present the commit to the user for confirmation before updating the checklist status.
3. THE Fix_Recovery_Engine SHALL use the finding's file path and line number range to scope the git log search, limiting the scan to relevant commits since the review was created.
4. IF no matching commit is found for an unfixed P1, THEN THE Fix_Recovery_Engine SHALL report the finding as genuinely unfixed and require manual resolution.

### Requirement 12: CI Command Discovery and Enforcement

**User Story:** As a developer using Forge, I want SKILL documents to direct the AI to read CI commands from `.forge/config.md` rather than assembling commands independently, so that the full CI validation suite is always executed.

#### Acceptance Criteria

1. THE forge-build SKILL_Document SHALL instruct the AI to read the `ci_check_command` field from `.forge/config.md` and execute those commands for final validation.
2. THE forge-test SKILL_Document SHALL instruct the AI to read the `ci_check_command` field from `.forge/config.md` and execute those commands for the test verification checklist.
3. THE SKILL_Documents SHALL instruct the AI to fail the validation step if `.forge/config.md` does not contain a `ci_check_command` field, rather than falling back to self-assembled commands.
4. WHEN `.forge/config.md` specifies multiple CI commands, THE SKILL_Documents SHALL instruct the AI to execute all commands in the specified order and report the first failure.
5. THE forge-build SKILL_Document and forge-test SKILL_Document SHALL reference `.forge/config.md` as the single source of truth for validation commands, with no hardcoded command alternatives.

### Requirement 13: Context Budget Integration into SKILL Documents

**User Story:** As a developer using Forge, I want each SKILL document to include a context budget management section that enforces token reduction rules, so that context optimization is applied consistently across all workflow phases.

#### Acceptance Criteria

1. THE forge-build SKILL_Document SHALL contain a context budget management section referencing Explore_Summarizer, Test_Output_Trimmer, Git_Output_Limiter, and Subagent_Summary_Protocol.
2. THE forge-review SKILL_Document SHALL contain a context budget management section referencing Review_Summarizer and write-and-discard protocol for review reports.
3. THE forge-decide SKILL_Document SHALL contain a context budget management section referencing Subagent_Summary_Protocol and write-and-discard protocol for decision documents.
4. THE context budget management sections SHALL not modify or remove any existing SKILL document content (TDD rules, severity grading, three-layer review structure, OWASP/STRIDE methodology).
5. WHEN a Restatement_Checkpoint is executed during the build phase, THE Restatement SHALL include a budget status line showing estimated tokens saved, without exceeding the Restatement's 1500-token budget.

### Requirement 14: Context Budget Reporting

**User Story:** As a developer using Forge, I want a session-end report showing how much context was saved by the budget management system, so that I can monitor optimization effectiveness over time.

#### Acceptance Criteria

1. WHEN a Forge session ends (via `/forge ship` or `/forge learn`), THE Context_Budget_Manager SHALL generate a budget report containing per-source token savings and total savings percentage.
2. THE Context_Budget_Manager SHALL write the budget report to `.forge/knowledge/sessions/<date>-<topic>-budget.md`.
3. WHEN the total savings percentage is below 30%, THE Context_Budget_Manager SHALL include a warning indicating that context optimization is underperforming.
4. FOR ALL valid Context Budget reports, serializing then deserializing SHALL produce an equivalent object (round-trip property).

### Requirement 15: Fix Existing Context Budget P1 Issues

**User Story:** As a developer using Forge, I want the three existing P1 issues in the context-budget module to be resolved, so that the module is reliable before new features build on it.

#### Acceptance Criteria

1. THE Explore_Summarizer SHALL implement error and empty-result passthrough logic that returns the error message without transformation when the Explore agent fails or returns no data.
2. THE Test_Output_Trimmer SHALL implement parse failure detection that retains the original output without modification and logs a warning when the test runner output format is unrecognized.
3. THE Test_Output_Trimmer SHALL include tests verifying compatibility with actual vitest output format samples.
4. THE Context_Budget_Manager SHALL validate enum values at runtime before type assertion in all deserializer functions, rejecting values outside the defined union types.
