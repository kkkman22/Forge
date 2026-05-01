/**
 * Status Manager — multi-file status tracking for parallel task execution.
 *
 * Provides high-level operations for reading, writing, listing, and
 * managing task status files in both single-task and multi-task modes.
 *
 * Mode detection is based on the existence of the .forge/status/ directory.
 * In single-task mode, all operations target .forge/status.md.
 * In multi-task mode, each task gets its own file under .forge/status/.
 */
export interface TaskStatusEntry {
    taskId: string;
    taskName: string;
    phase: string;
    tier?: string;
    updated?: string;
    filePath: string;
}
export interface StatusManagerIO {
    exists: (path: string) => boolean;
    dirExists: (path: string) => boolean;
    read: (path: string) => string;
    write: (path: string, content: string) => void;
    listDir: (path: string) => string[];
    move: (src: string, dest: string) => void;
    mkdirp: (path: string) => void;
}
/**
 * Read status for a specific task.
 *
 * Priority: .forge/status/<task-id>.md → .forge/status.md → empty string
 */
export declare function readTaskStatus(io: StatusManagerIO, forgeRoot: string, taskName: string): string;
/**
 * Write status for a specific task.
 *
 * In multi-task mode, writes to .forge/status/<task-id>.md.
 * In single-task mode, writes to .forge/status.md.
 * Write failures are logged and do not crash.
 */
export declare function writeTaskStatus(io: StatusManagerIO, forgeRoot: string, taskName: string, content: string): void;
/**
 * List all active tasks (phase is not "completed" or "aborted").
 *
 * Scans both .forge/status.md and .forge/status/*.md.
 */
export declare function listActiveTasks(io: StatusManagerIO, forgeRoot: string): TaskStatusEntry[];
/**
 * Get the most recently updated active task.
 *
 * Used by Context_Hook to select which task's context to inject.
 */
export declare function getMostRecentActiveTask(io: StatusManagerIO, forgeRoot: string): TaskStatusEntry | null;
/**
 * Migrate from single-task (status.md) to multi-task (status/*.md) mode.
 *
 * Steps:
 *   1. Read current_task from legacy status.md
 *   2. Slugify to get task-id
 *   3. Create .forge/status/ directory
 *   4. Copy legacy content to .forge/status/<task-id>.md
 *   5. Clear legacy status.md (preserve empty frontmatter)
 */
export declare function migrateToMultiTask(io: StatusManagerIO, forgeRoot: string): void;
/**
 * Archive a task's status file to .forge/archive/<date>-<task-id>/status.md.
 */
export declare function archiveTaskStatus(io: StatusManagerIO, forgeRoot: string, taskName: string, date: string): void;
