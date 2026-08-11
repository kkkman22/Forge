---
status: completed
feature: error-recovery-strategy
layout: requirements
created: 2026-04-29
tier: standard
---
# Requirements Document

## Introduction

Forge 会话在执行过程中可能因多种原因中断（context limit、崩溃、超时）。中断后，已完成的工作（git commits、文件修改、progress 更新）散落在不同的持久化层，缺乏统一的恢复机制来识别和协调这些不一致状态。

根据 dogfooding 观察（Finding 8），当前 `/forge resume` 仅从 `.forge/status.md` 和 `.forge/progress/<topic>.md` 读取状态，不检查 git log，无法从 commit 推断任务完成状态。这导致五种中断场景下的状态不一致无法被自动检测和修复：

1. 任务完成但未提交（最常见）
2. 已提交但 progress 未更新
3. Progress 已更新但 phase 未推进
4. Subagent 执行中中断（最难恢复）
5. 恢复优先级链缺失

本功能通过增强 `/forge resume` 的状态一致性检测能力，引入 git log 扫描、未提交变更检测、状态交叉比对，以及长任务拆分策略和中断点精确定位机制，实现会话中断后的自动恢复。

## Glossary

- **Recovery_Engine**：错误恢复引擎的核心模块，负责协调各持久化层的状态检测、不一致识别和修复建议生成。
- **Git_State_Scanner**：Git 状态扫描器，负责扫描 git log 和 git status，提取 commit 信息和未提交变更，与 Plan 任务列表进行匹配。
- **Progress_Reconciler**：进度协调器，负责比对 git log 中的 commit 记录与 `.forge/progress/<topic>.md` 中的任务状态，识别并修复不一致。
- **Phase_Reconciler**：阶段协调器，负责比对 `.forge/progress/<topic>.md` 中的任务完成状态与 `.forge/status.md` 中的 phase 字段，识别并修复阶段推进不一致。
- **Interruption_Classifier**：中断点分类器，负责分析当前持久化层状态，将中断点精确归类为五种中断场景之一。
- **Uncommitted_Change_Detector**：未提交变更检测器，负责检测工作目录中与当前任务相关的未提交文件变更，并验证其有效性。
- **Recovery_Report**：恢复报告，由 Recovery_Engine 生成的结构化报告，包含检测到的不一致项、修复建议和用户确认选项。
- **Task_Segmentation_Manager**：长任务拆分管理器，负责将跨会话的长任务拆分为可独立完成的段落，并通过文件系统持久化中间状态。
- **Forge**：本项目的 AI 编码工作流引擎，通过 `/forge` 命令驱动完整开发流程。
- **Plan_Document**：位于 `.forge/plans/<topic>.md` 的计划文档，包含任务列表、commit message 模式和依赖关系。
- **Progress_Document**：位于 `.forge/progress/<topic>.md` 的进度文档，记录每个任务的完成状态。
- **Status_Document**：位于 `.forge/status.md` 的全局状态文档，记录当前任务、档位、阶段和更新时间。
- **Interim_Log**：位于 `.forge/knowledge/sessions/<date>-<topic>-interim.md` 的中间会话日志，记录 Restatement Checkpoint 的快照信息。
- **Atomic_Commit**：原子提交，Forge build 阶段的提交规范——一个任务对应一个 commit，commit message 由 Plan 定义。

## Requirements

### Requirement 1: Git Log 扫描与任务匹配

**User Story:** As a developer, I want `/forge resume` to scan git log and match commits against the Plan task list, so that tasks completed via commit but not marked in progress can be automatically detected.

#### Acceptance Criteria

1. WHEN `/forge resume` is executed, THE Git_State_Scanner SHALL read the Plan_Document to extract the expected commit message patterns for each task.
2. WHEN `/forge resume` is executed, THE Git_State_Scanner SHALL scan the git log (limited to commits since the last known session start timestamp from Status_Document) and match each commit message against the expected commit message patterns from the Plan_Document.
3. WHEN a commit message matches a Plan task's expected commit message pattern and the corresponding task is not marked as completed in the Progress_Document, THE Progress_Reconciler SHALL flag the task as "committed but progress not updated" in the Recovery_Report.
4. THE Git_State_Scanner SHALL use the commit message prefix convention defined in the Plan_Document (e.g., `feat(topic):`, `fix(topic):`) for pattern matching, tolerating minor variations in wording while requiring the prefix and task-identifying keywords to match.
5. IF the git log contains no commits since the last session start timestamp, THEN THE Git_State_Scanner SHALL skip commit matching and report "no new commits detected" in the Recovery_Report.

### Requirement 2: 未提交变更检测

**User Story:** As a developer, I want `/forge resume` to detect uncommitted file changes related to the current task, so that work completed but not committed is not lost after session interruption.

#### Acceptance Criteria

1. WHEN `/forge resume` is executed, THE Uncommitted_Change_Detector SHALL run `git status` to identify all modified, added, and deleted files in the working directory.
2. WHEN uncommitted changes are detected, THE Uncommitted_Change_Detector SHALL compare the changed file paths against the file paths specified in the current task's Plan_Document entry to determine relevance.
3. WHEN uncommitted changes are relevant to the current task, THE Uncommitted_Change_Detector SHALL run the verification commands defined in `.forge/config.md` (ci_check_command or verify_commands) against the changed files to assess validity.
4. WHEN verification passes for uncommitted changes, THE Recovery_Report SHALL present the user with two options: (a) commit the changes with the Plan-defined commit message, or (b) discard the changes and redo the task.
5. WHEN verification fails for uncommitted changes, THE Recovery_Report SHALL present the user with two options: (a) keep the changes for manual inspection, or (b) discard the changes and redo the task from the beginning.
6. IF no uncommitted changes are detected, THEN THE Uncommitted_Change_Detector SHALL report "working directory clean" in the Recovery_Report.

### Requirement 3: Progress 与 Git Log 状态交叉比对

**User Story:** As a developer, I want `/forge resume` to automatically reconcile progress state with git log state, so that tasks confirmed by commits are correctly reflected in the progress document.

#### Acceptance Criteria

1. WHEN the Progress_Reconciler identifies tasks flagged as "committed but progress not updated", THE Progress_Reconciler SHALL present the list of inconsistent tasks in the Recovery_Report with the matching commit hash, commit message, and commit timestamp for each task.
2. WHEN the user confirms reconciliation, THE Progress_Reconciler SHALL update the Progress_Document to mark each confirmed task as completed, including the commit timestamp as the completion time.
3. THE Progress_Reconciler SHALL process tasks in the order they appear in the Plan_Document, preserving task dependency ordering.
4. IF a task's commit is found but a preceding dependent task is not marked as completed and has no matching commit, THEN THE Progress_Reconciler SHALL flag the dependency gap in the Recovery_Report and request user guidance before marking the later task as completed.
5. WHEN automatic reconciliation is applied, THE Progress_Reconciler SHALL append a reconciliation note to the Progress_Document indicating which tasks were auto-reconciled and the source commit hashes.

### Requirement 4: Phase 与 Progress 一致性检测

**User Story:** As a developer, I want `/forge resume` to detect and fix phase advancement inconsistencies, so that the global status accurately reflects the actual progress of the workflow.

#### Acceptance Criteria

1. WHEN all tasks in the Progress_Document are marked as completed and the Status_Document phase field has not advanced to the next phase in the command sequence, THE Phase_Reconciler SHALL flag the inconsistency in the Recovery_Report.
2. WHEN the user confirms phase advancement, THE Phase_Reconciler SHALL update the Status_Document phase field to the next phase in the command sequence (build → review, review → test, test → ship, as defined in `forge-build/SKILL.md` §7.2).
3. WHEN the Progress_Document shows partially completed tasks and the Status_Document phase is ahead of the actual progress, THE Phase_Reconciler SHALL flag the reverse inconsistency (phase too far ahead) in the Recovery_Report and suggest reverting the phase.
4. THE Phase_Reconciler SHALL validate the phase transition against the tier-specific command sequence (lightweight: build → review, standard: plan → build → review → test → ship, full: decide → spec → plan → build → review → test → ship → learn).

### Requirement 5: 中断点精确分类

**User Story:** As a developer, I want `/forge resume` to precisely classify the interruption point into one of five defined scenarios, so that the appropriate recovery strategy is applied.

#### Acceptance Criteria

1. THE Interruption_Classifier SHALL classify the current interruption state into exactly one of five categories: (a) task completed but not committed, (b) committed but progress not updated, (c) progress updated but phase not advanced, (d) Subagent mid-execution interruption, (e) clean state (no inconsistency detected).
2. WHEN classifying as "task completed but not committed", THE Interruption_Classifier SHALL verify that uncommitted changes exist in the working directory and that the changes are relevant to the current task as defined in the Plan_Document.
3. WHEN classifying as "committed but progress not updated", THE Interruption_Classifier SHALL verify that a matching commit exists in git log and the corresponding task is not marked as completed in the Progress_Document.
4. WHEN classifying as "progress updated but phase not advanced", THE Interruption_Classifier SHALL verify that all tasks in the Progress_Document are marked as completed and the Status_Document phase has not advanced.
5. WHEN classifying as "Subagent mid-execution interruption", THE Interruption_Classifier SHALL detect the presence of new test files without corresponding complete implementation files, or partially modified implementation files that do not pass verification.
6. THE Interruption_Classifier SHALL execute classification checks in the defined priority order: (a) → (b) → (c) → (d) → (e), and report the first matching category.

### Requirement 6: Subagent 中断恢复

**User Story:** As a developer, I want `/forge resume` to detect and handle Subagent mid-execution interruptions, so that incomplete TDD cycles can be recovered without losing already-written test code.

#### Acceptance Criteria

1. WHEN the Interruption_Classifier identifies a "Subagent mid-execution interruption", THE Recovery_Engine SHALL analyze the working directory to determine the TDD phase at interruption: RED (test files exist, implementation missing or empty), GREEN-incomplete (test files exist, implementation exists but tests fail), or REFACTOR-incomplete (tests pass but uncommitted refactoring changes exist).
2. WHEN the TDD phase at interruption is RED or GREEN-incomplete, THE Recovery_Report SHALL present the user with two options: (a) preserve existing test files and resume from the GREEN phase, or (b) discard all uncommitted changes and restart the task from the beginning.
3. WHEN the TDD phase at interruption is REFACTOR-incomplete, THE Recovery_Report SHALL present the user with two options: (a) commit the current passing state and skip refactoring, or (b) continue the refactoring phase.
4. THE Recovery_Engine SHALL identify test files by matching file paths against the project's test file naming convention (files matching `*.test.ts`, `*.spec.ts`, or files in `test/` or `__tests__/` directories).
5. IF the Recovery_Engine cannot determine the TDD phase (ambiguous file state), THEN THE Recovery_Report SHALL present the full list of uncommitted changes and request the user to manually classify the interruption state.

### Requirement 7: 恢复优先级链执行

**User Story:** As a developer, I want `/forge resume` to execute recovery checks in a defined priority chain, so that all inconsistencies are detected and resolved in the correct order before resuming work.

#### Acceptance Criteria

1. WHEN `/forge resume` is executed, THE Recovery_Engine SHALL execute the recovery priority chain in the following fixed order: (1) read Status_Document, (2) read Interim_Log if present, (3) scan git log for commit matching, (4) check git status for uncommitted changes, (5) reconcile Progress_Document against git log, (6) reconcile phase against progress, (7) classify interruption point, (8) generate Recovery_Report.
2. THE Recovery_Engine SHALL complete all eight steps of the priority chain before presenting the Recovery_Report to the user, collecting all inconsistencies in a single report rather than stopping at the first inconsistency found.
3. WHEN the Recovery_Report contains one or more inconsistencies, THE Recovery_Engine SHALL present each inconsistency with its category, evidence, and recommended fix action, and wait for user confirmation before applying any fixes.
4. WHEN the user confirms all fixes, THE Recovery_Engine SHALL apply fixes in dependency order (progress reconciliation before phase reconciliation) and verify each fix was applied correctly.
5. WHEN the Recovery_Report contains zero inconsistencies, THE Recovery_Engine SHALL output the standard five-question recovery format (as defined in `forge-resume/SKILL.md`) and proceed to automatic task positioning.

### Requirement 8: 恢复报告格式

**User Story:** As a developer, I want the recovery report to present detected inconsistencies in a clear, structured format, so that I can quickly understand the state and make informed recovery decisions.

#### Acceptance Criteria

1. THE Recovery_Report SHALL include a header section containing: task name (from Status_Document), tier, phase, last update timestamp, and interruption classification result.
2. THE Recovery_Report SHALL include an inconsistency section listing each detected inconsistency with: category label, evidence description (file paths, commit hashes, or state values), and recommended action.
3. WHEN inconsistencies are detected, THE Recovery_Report SHALL include an action section presenting numbered options for each inconsistency, with a default recommended option marked.
4. THE Recovery_Report SHALL include a summary section stating the total number of inconsistencies detected, the number of auto-fixable inconsistencies, and the number requiring user decision.
5. WHEN the user selects an action for each inconsistency, THE Recovery_Engine SHALL execute the selected actions and output a confirmation for each applied fix.

### Requirement 9: 长任务跨会话拆分

**User Story:** As a developer, I want long-running tasks (build and review) to be splittable across multiple sessions, so that context limit interruptions do not require restarting the entire workflow phase.

#### Acceptance Criteria

1. THE Task_Segmentation_Manager SHALL persist the current task execution position (task index within the Plan_Document task list) to the Progress_Document after each Atomic_Commit, so that a new session can resume from the exact next task.
2. WHEN `/forge resume` detects that a build phase was interrupted mid-way through the task list, THE Task_Segmentation_Manager SHALL calculate the remaining tasks and present a continuation plan showing: completed tasks (with commit references), current task (with interruption state), and remaining tasks.
3. THE Task_Segmentation_Manager SHALL ensure that each task's Closure-First probe results are not carried across sessions, requiring fresh probes for the first task in a new session.
4. WHEN `/forge resume` detects that a review phase was interrupted, THE Task_Segmentation_Manager SHALL check which reviewers (spec-check, quality-check, security-check) have already completed their evaluation (by checking for persisted review output in `.forge/reviews/`) and only re-invoke reviewers that have not completed.
5. THE Task_Segmentation_Manager SHALL update the Interim_Log with the segmentation boundary (last completed task index and timestamp) at each task completion, so that `/forge resume` can reconstruct the execution position without re-scanning git log.

### Requirement 10: Build 阶段原子操作事务性保障

**User Story:** As a developer, I want the commit-progress-phase update sequence in the build phase to follow a transactional checkpoint pattern, so that interruptions between these steps produce a recoverable state.

#### Acceptance Criteria

1. WHEN a task's TDD cycle completes and verification passes, THE Recovery_Engine SHALL enforce the following update sequence: (1) execute git commit (Atomic_Commit), (2) update Progress_Document to mark task as completed, (3) update Status_Document if phase advancement is needed, with each step completing before the next begins.
2. WHEN the update sequence is interrupted between step 1 (commit) and step 2 (progress update), THE Recovery_Engine SHALL detect this state during the next `/forge resume` via git log scanning and auto-reconcile the Progress_Document.
3. WHEN the update sequence is interrupted between step 2 (progress update) and step 3 (status update), THE Recovery_Engine SHALL detect this state during the next `/forge resume` via phase-progress comparison and auto-reconcile the Status_Document.
4. THE Recovery_Engine SHALL write a checkpoint marker to the Interim_Log before starting the update sequence, containing the task identifier and intended commit message, so that an interruption during the sequence can be diagnosed.
5. WHEN the checkpoint marker exists in the Interim_Log but the corresponding commit is not found in git log, THE Recovery_Engine SHALL classify this as "task completed but not committed" and apply the corresponding recovery strategy.

### Requirement 11: 恢复报告序列化往返一致性

**User Story:** As a developer, I want the Recovery_Report serialization and parsing to maintain round-trip consistency, so that persisted recovery state can be reliably reconstructed.

#### Acceptance Criteria

1. THE Recovery_Engine SHALL serialize the Recovery_Report to a structured markdown format that can be written to `.forge/debug/last-recovery.md`.
2. FOR ALL valid Recovery_Report objects, THE Recovery_Engine serializer SHALL produce output that, when parsed by the corresponding deserializer, yields a semantically equivalent Recovery_Report object (round-trip property).
3. THE Recovery_Report serializer SHALL preserve all fields including: interruption classification, inconsistency list (with category, evidence, and recommended action for each), and action selections.
4. FOR ALL valid Interruption_Classifier result objects, THE Interruption_Classifier serializer SHALL produce output that, when parsed by the corresponding deserializer, yields a semantically equivalent classification result (round-trip property).

