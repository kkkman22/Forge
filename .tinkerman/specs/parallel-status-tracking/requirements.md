---
status: completed
feature: parallel-status-tracking
layout: requirements
created: 2026-04-29
tier: standard
---
# Requirements Document

## Introduction

Forge 当前的 `.tinkerman/status.md` 被设计为单任务状态快照，只能记录一个任务的 phase、tier、task name 等信息。当用户通过 Git Worktree 并行开发多个任务时，多个 worktree 共享同一个 `.tinkerman/status.md`，导致状态互相覆盖、`/forge resume` 只能恢复最后写入的任务、第三个任务启动时被提示有未完成的旧任务。

本功能引入多文件状态追踪模式（`.tinkerman/status/<task-id>.md`），使每个并行任务拥有独立的状态文件，同时保持单任务场景下的完全向后兼容。

## Glossary

- **Status_Manager**: 负责状态文件读写的核心模块，封装了状态文件路径解析、读取、写入、列举和清理操作。对应 `src/sdk-status-helpers.ts` 和 `src/status-file-ext.ts` 中的函数集合。
- **Status_Resolver**: 负责根据当前执行上下文（worktree 名称、task name、运行模式）确定应读写哪个状态文件的路径解析组件。
- **StatusFile**: 存储单个任务执行状态的 Markdown 文件，包含 YAML frontmatter（current_task、tier、phase、hints、mode 等字段）。
- **Legacy_StatusFile**: 位于 `.tinkerman/status.md` 的传统单文件状态，用于单任务场景的向后兼容。
- **Task_StatusFile**: 位于 `.tinkerman/status/<task-id>.md` 的独立任务状态文件，用于多任务并行场景。
- **Task_ID**: 任务的唯一标识符，由任务名称经 slugify 处理后生成（小写、连字符分隔、去除特殊字符），用作 Task_StatusFile 的文件名。
- **Active_Task**: phase 字段不为 `completed` 且不为 `aborted` 的任务。
- **Forge_Router**: `/forge` 入口路由器，负责三维路由分析并写入初始状态。
- **Forge_Loop**: `/forge loop` 自主执行引擎，以迭代方式驱动 Skills 命令序列，依赖 StatusFile 的 phase 字段确定下一个 SKILL 阶段。
- **Forge_Resume**: `/forge resume` 会话恢复命令，读取 StatusFile 恢复工作上下文。
- **Context_Hook**: `hooks/hooks.json` 中的 UserPromptSubmit hook，通过 shell 命令读取状态文件注入上下文。
- **Worktree**: Git worktree，Forge 用于隔离并行任务的独立工作目录。

## Requirements

### Requirement 1: Status_Resolver 路径解析

**User Story:** As a developer running parallel tasks, I want each task to have its own status file, so that parallel tasks do not overwrite each other's state.

#### Acceptance Criteria

1. WHEN a new task is started with a task name, THE Status_Resolver SHALL generate a Task_ID by slugifying the task name (lowercase, replace spaces and special characters with hyphens, collapse consecutive hyphens, trim leading/trailing hyphens).
2. WHEN operating in multi-task mode, THE Status_Resolver SHALL resolve the status file path to `.tinkerman/status/<task-id>.md`.
3. WHEN operating in single-task mode (no `.tinkerman/status/` directory exists and only one task is active), THE Status_Resolver SHALL resolve the status file path to `.tinkerman/status.md` (Legacy_StatusFile).
4. THE Status_Resolver SHALL produce deterministic Task_IDs: FOR ALL valid task names, slugifying the same task name twice SHALL produce the same Task_ID.
5. IF the task name is empty or contains only special characters, THEN THE Status_Resolver SHALL return a descriptive error indicating the task name cannot be slugified.

### Requirement 2: Status_Manager 多文件读写

**User Story:** As a developer, I want the status management system to transparently handle both single-file and multi-file modes, so that I don't need to manually manage status files.

#### Acceptance Criteria

1. WHEN writing status for a task in multi-task mode, THE Status_Manager SHALL create the `.tinkerman/status/` directory if it does not exist, and write the task's StatusFile to `.tinkerman/status/<task-id>.md`.
2. WHEN reading status for a specific task, THE Status_Manager SHALL first look for `.tinkerman/status/<task-id>.md`; IF that file does not exist, THE Status_Manager SHALL fall back to reading `.tinkerman/status.md`.
3. THE Status_Manager SHALL preserve the existing YAML frontmatter format (current_task, tier, phase, hints, mode, loop_run_id, loop_iteration, skill_sequence, updated) in each Task_StatusFile.
4. WHEN listing all active tasks, THE Status_Manager SHALL scan both `.tinkerman/status.md` and all files in `.tinkerman/status/`, returning a list of Active_Task entries with their task names and phases.
5. IF writing a Task_StatusFile fails due to filesystem errors, THEN THE Status_Manager SHALL log a warning and continue operation without crashing (graceful degradation).

### Requirement 3: Forge_Router 多任务状态初始化

**User Story:** As a developer starting a new task, I want the router to correctly initialize status for my task without disrupting other running tasks.

#### Acceptance Criteria

1. WHEN a new task is started and other Active_Tasks exist, THE Forge_Router SHALL write the new task's status to a Task_StatusFile (`.tinkerman/status/<task-id>.md`) instead of overwriting Legacy_StatusFile.
2. WHEN a new task is started and no other Active_Tasks exist, THE Forge_Router SHALL write to Legacy_StatusFile (`.tinkerman/status.md`) for backward compatibility.
3. WHEN a new task is started and Active_Tasks exist, THE Forge_Router SHALL display the list of active tasks and their phases before prompting for confirmation, instead of showing the "overwrite or abort" prompt.
4. THE Forge_Router SHALL write all standard frontmatter fields (current_task, tier, task_type, project_phase, phase, hints, updated) to the selected StatusFile.

### Requirement 4: Forge_Loop 多任务状态感知

**User Story:** As a developer using `/forge loop`, I want the loop engine to read and write the correct task-specific status file, so that parallel loops do not interfere with each other.

#### Acceptance Criteria

1. WHEN Forge_Loop starts, THE Forge_Loop SHALL resolve the StatusFile path using Status_Resolver based on the current task name, and read/write only that task's StatusFile throughout the run.
2. WHEN Forge_Loop writes Loop-specific fields (mode, loop_run_id, loop_iteration, skill_sequence), THE Forge_Loop SHALL write them to the task-specific StatusFile resolved at startup.
3. WHEN Forge_Loop detects residual Loop state from a previous abnormal exit, THE Forge_Loop SHALL only clean residual state from the current task's StatusFile, leaving other tasks' StatusFiles untouched.
4. WHEN Forge_Loop completes normally, THE Forge_Loop SHALL clear Loop fields only from the current task's StatusFile.

### Requirement 5: Forge_Resume 多任务恢复

**User Story:** As a developer resuming work, I want `/forge resume` to let me choose which task to resume when multiple tasks are active, so that I can continue the right task.

#### Acceptance Criteria

1. WHEN `/forge resume` is invoked and multiple Active_Tasks exist, THE Forge_Resume SHALL display a numbered list of all Active_Tasks with their task names, phases, and last updated timestamps.
2. WHEN `/forge resume` is invoked and multiple Active_Tasks exist, THE Forge_Resume SHALL prompt the user to select which task to resume.
3. WHEN `/forge resume` is invoked and exactly one Active_Task exists, THE Forge_Resume SHALL automatically resume that task without prompting.
4. WHEN a task is selected for resumption, THE Forge_Resume SHALL read the selected task's StatusFile (either Legacy_StatusFile or Task_StatusFile) and generate the five-question recovery output based on that task's state.

### Requirement 6: Forge_Status 多任务展示

**User Story:** As a developer, I want `/forge status` to show all active parallel tasks, so that I can see the overall progress of my parallel work.

#### Acceptance Criteria

1. WHEN multiple Active_Tasks exist, THE Forge_Status SHALL display a summary table listing all Active_Tasks with their task names, tiers, phases, and last updated timestamps.
2. WHEN multiple Active_Tasks exist, THE Forge_Status SHALL display detailed progress for each task (completed/in-progress/blocked task counts) below the summary table.
3. WHEN only one Active_Task exists, THE Forge_Status SHALL display the single-task format identical to the current behavior.

### Requirement 7: Context_Hook 兼容性

**User Story:** As a developer, I want the existing hooks to continue working correctly regardless of whether status is stored in single-file or multi-file mode, so that context injection is not broken.

#### Acceptance Criteria

1. WHILE the system is in single-task mode (Legacy_StatusFile only), THE Context_Hook SHALL read `.tinkerman/status.md` and inject context identically to the current behavior.
2. WHILE the system is in multi-task mode, THE Context_Hook SHALL read all Task_StatusFiles in `.tinkerman/status/` and inject context for the most recently updated Active_Task.
3. THE Context_Hook SHALL complete status file reading within 5 seconds (matching the existing hook timeout constraint).
4. IF no StatusFile exists (neither Legacy_StatusFile nor any Task_StatusFile), THEN THE Context_Hook SHALL produce no output and exit cleanly.

### Requirement 8: 向后兼容与迁移

**User Story:** As a developer with existing projects, I want the upgrade to be seamless, so that my current single-task workflow is not disrupted.

#### Acceptance Criteria

1. WHILE no `.tinkerman/status/` directory exists, THE Status_Manager SHALL operate in single-task mode using Legacy_StatusFile exclusively, with behavior identical to the current implementation.
2. WHEN the first parallel task is started (second Active_Task detected), THE Status_Manager SHALL migrate the existing Legacy_StatusFile content into `.tinkerman/status/<task-id>.md` for the original task, then create a new Task_StatusFile for the new task.
3. WHEN all parallel tasks complete or are aborted (zero Active_Tasks in `.tinkerman/status/`), THE Status_Manager SHALL NOT automatically remove the `.tinkerman/status/` directory (cleanup is deferred to `/forge abort` or manual action).
4. THE Status_Manager SHALL support reading Legacy_StatusFile format without any changes to the YAML frontmatter schema.

### Requirement 9: Forge_Abort 多任务清理

**User Story:** As a developer, I want `/forge abort` to correctly handle aborting a specific task or all tasks, so that I can cleanly stop parallel work.

#### Acceptance Criteria

1. WHEN `/forge abort` is invoked and multiple Active_Tasks exist, THE Forge_Abort SHALL display a list of Active_Tasks and prompt the user to select which task to abort, or offer an "abort all" option.
2. WHEN a specific task is aborted, THE Forge_Abort SHALL archive that task's StatusFile and related state files, leaving other tasks' StatusFiles untouched.
3. WHEN "abort all" is selected, THE Forge_Abort SHALL archive all Active_Tasks' StatusFiles and reset to a clean state.
4. WHEN the last Active_Task is aborted from `.tinkerman/status/`, THE Forge_Abort SHALL reset Legacy_StatusFile to its initial empty state.

### Requirement 10: Task_ID Slugify 与 Pretty_Print

**User Story:** As a developer, I want task IDs to be readable and reversible, so that I can identify which status file belongs to which task.

#### Acceptance Criteria

1. THE Slugify function SHALL convert task names to URL-safe, filesystem-safe identifiers using only lowercase alphanumeric characters and hyphens.
2. THE Slugify function SHALL handle Unicode characters by transliterating CJK characters to pinyin or removing them, producing a non-empty result for any task name containing at least one alphanumeric character.
3. THE Pretty_Printer SHALL format Task_StatusFile paths back into human-readable task names by reading the `current_task` field from the file's YAML frontmatter.
4. FOR ALL valid task names containing at least one alphanumeric character, slugifying then reading the `current_task` field from the resulting StatusFile SHALL recover the original task name (round-trip property via frontmatter).
