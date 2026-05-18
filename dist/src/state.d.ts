/**
 * State system — core logic extracted from the unified state system design.
 *
 * Implements:
 *   - validateStateFile:  Checks that a .forge/ state file uses .md extension
 *                         and structured data uses YAML frontmatter
 *   - normalizeForgePath: Normalizes file paths to .forge/-relative form,
 *                         resolving `..` sequences, redundant separators,
 *                         and absolute path prefixes.
 *
 * Property 15: 状态文件格式统一
 *   - All state files under .forge/ must have .md extension
 *   - Structured data must use YAML frontmatter (--- delimited block at start)
 *   **Validates: Requirements 11.2**
 */
import { type Methodology } from "./schemas/review-report.js";
export interface StateFile {
    /** File path relative to .forge/, e.g. "config.md", "specs/feature/spec.md" */
    path: string;
    /** Raw file content. */
    content: string;
}
export interface StateFileValidation {
    valid: boolean;
    errors: string[];
}
/** Structured StatusFile fields with all fields guaranteed present. */
export interface StatusFields {
    current_task: string;
    tier: string;
    phase: string;
    task_type: string;
    project_phase: string;
    hints: string;
    assumptions: string[];
    mode: string;
    updated: string;
}
/** Structured review report fields with all fields guaranteed present. */
export interface ReviewReportFields {
    result: string;
    /** Commit hash at the time of review. Optional for backward compatibility. */
    reviewed_at_commit?: string;
    p0_count: number;
    p1_count: number;
    p2_count: number;
    p3_count: number;
    /** How the review report was produced. Default: subagent-parallel. */
    methodology: Methodology;
}
export declare const STATUS_DEFAULTS: StatusFields;
export declare const REVIEW_REPORT_DEFAULTS: ReviewReportFields;
/**
 * Parse StatusFile frontmatter with graceful fallback to defaults.
 *
 * - undefined/empty content → all defaults + warnings
 * - missing frontmatter → all defaults + warnings
 * - partial fields → missing fields use STATUS_DEFAULTS + warnings
 * - complete input → normal parse, no warnings
 */
export declare function parseStatusFileGraceful(content: string | undefined): {
    parsed: StatusFields;
    warnings: string[];
};
/**
 * Parse review report frontmatter with graceful fallback to defaults.
 *
 * - undefined/empty content → all defaults + warnings
 * - missing fields → REVIEW_REPORT_DEFAULTS + warnings
 * - result defaults to "incomplete" (safe — blocks ship)
 */
export declare function parseReviewReportGraceful(content: string | undefined): {
    parsed: ReviewReportFields;
    warnings: string[];
};
/**
 * Validate that a .forge/ state file meets the unified format requirements:
 *
 * 1. File extension must be .md
 * 2. Structured data must use YAML frontmatter (content starts with "---")
 *
 * Per design Property 15 and Requirements 11.2:
 *   - All state files under .forge/ use .md format
 *   - Structured data uses YAML frontmatter
 */
export declare function validateStateFile(file: StateFile): StateFileValidation;
/**
 * Check if a file path has the .md extension.
 *
 * Simple utility used by Property 15 tests.
 */
export declare function hasMarkdownExtension(filePath: string): boolean;
/**
 * Check if content has valid YAML frontmatter.
 *
 * YAML frontmatter is a block delimited by "---" at the start and end,
 * appearing at the very beginning of the file content.
 */
export declare function hasYamlFrontmatter(content: string): boolean;
/**
 * Normalize a file path to its `.forge/`-relative form.
 *
 * Steps:
 *   1. Unify separators to forward slashes (posix)
 *   2. Apply `path.posix.normalize` to resolve `..` sequences and redundant separators
 *   3. Strip everything up to and including the last `.forge/` marker
 *   4. Remove any leading `./` or `/` from the result
 *
 * Uses lexical normalization only (no `fs.realpath`), which is correct for
 * the Hook use case where we check the path as given, not the resolved target.
 *
 * @param inputPath - Any path variant: absolute, relative, with `..`, redundant separators, etc.
 * @returns The `.forge/`-relative path (e.g. "specs/feature/spec.md"), or the
 *          normalized path as-is if it doesn't contain `.forge/`.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */
export declare function normalizeForgePath(inputPath: string): string;
/**
 * Protection zone for a .forge/ state file.
 *
 * - frozen:    AI must not modify (locked specs, approved plans, config)
 * - guarded:   AI may append but not delete or overwrite existing content
 * - open:      AI may freely create and modify
 */
export type ProtectionZone = "frozen" | "guarded" | "open";
/**
 * Determine the protection zone of a .forge/ state file.
 *
 * @param forgePath - Path relative to .forge/, e.g. "specs/feature/spec.md", "config.md"
 * @returns The protection zone for this file path.
 */
export declare function getProtectionZone(forgePath: string): ProtectionZone;
/**
 * Extract the `status` field value from YAML frontmatter content.
 *
 * Returns the status string if found, or null if not present.
 */
export declare function extractFrontmatterStatus(content: string): string | null;
/**
 * Check whether a write operation to a .forge/ file should be blocked.
 *
 * A write is blocked when:
 *   - The file is in the frozen zone AND its current status is "locked" or "approved"
 *
 * Guarded zone files are not blocked (append-only enforcement requires diff analysis
 * which is handled at the hook level, not here).
 *
 * @param forgePath - Path relative to .forge/
 * @param currentContent - Current file content (to check frontmatter status)
 * @returns { blocked, reason } — whether the write should be blocked and why.
 */
export declare function checkWritePermission(forgePath: string, currentContent: string): {
    blocked: boolean;
    reason: string;
};
/**
 * Default lock timeout in milliseconds (30 seconds).
 * A lock older than this is considered stale and can be forcibly acquired.
 */
export declare const DEFAULT_LOCK_TIMEOUT_MS = 30000;
/**
 * Lock directory path relative to .forge/.
 */
export declare const LOCK_DIR = ".forge/.locks";
/**
 * Information stored in a lock file.
 */
export interface LockInfo {
    /** Who acquired the lock (e.g. subagent ID or task ID). */
    holder: string;
    /** ISO timestamp when the lock was acquired. */
    acquiredAt: string;
    /** The file being locked (path relative to .forge/). */
    targetFile: string;
}
/**
 * Result of a lock acquisition attempt.
 */
export interface LockResult {
    acquired: boolean;
    /** Path to the lock file (for release). */
    lockFilePath: string;
    /** If not acquired, reason why. */
    reason: string;
}
/**
 * Generate the lock file path for a given .forge/ state file.
 *
 * Converts the target file path to a flat lock file name by replacing
 * path separators with double underscores.
 *
 * Example: "progress/topic.md" → ".forge/.locks/progress__topic.md.lock"
 */
export declare function lockFilePath(forgePath: string): string;
/**
 * Determine whether an existing lock is stale (expired).
 *
 * A lock is stale if the time elapsed since acquiredAt exceeds the timeout.
 *
 * @param lockInfo - The lock information to check.
 * @param nowMs - Current time in milliseconds (Date.now()).
 * @param timeoutMs - Lock timeout in milliseconds.
 * @returns true if the lock is stale and can be forcibly acquired.
 */
export declare function isLockStale(lockInfo: LockInfo, nowMs: number, timeoutMs: number): boolean;
/**
 * Attempt to acquire a lock for a .forge/ state file.
 *
 * This is a pure function that computes the lock decision. The actual
 * file system operations (creating/reading lock files) are performed
 * by the caller (SKILL.md instructions or hook scripts).
 *
 * Rules:
 *   - If no existing lock → acquire
 *   - If existing lock is stale (older than timeout) → acquire (override)
 *   - If existing lock is held by the same holder → acquire (re-entrant)
 *   - If existing lock is fresh and held by another → reject
 *
 * @param forgePath - Target file path relative to .forge/
 * @param holder - Identity of the lock requester
 * @param existingLock - Current lock info if a lock file exists, null if no lock
 * @param nowMs - Current time in milliseconds
 * @param timeoutMs - Lock timeout in milliseconds
 */
export declare function tryAcquireLock(forgePath: string, holder: string, existingLock: LockInfo | null, nowMs: number, timeoutMs?: number): LockResult;
/**
 * Create the lock info object for a successful acquisition.
 *
 * @param forgePath - Target file path relative to .forge/
 * @param holder - Identity of the lock holder
 * @param nowIso - Current time as ISO string
 */
export declare function createLockInfo(forgePath: string, holder: string, nowIso: string): LockInfo;
/**
 * Serialize lock info to a string suitable for writing to a lock file.
 */
export declare function serializeLockInfo(info: LockInfo): string;
/**
 * Parse lock info from a lock file's content.
 * Returns null if the content is not a valid lock file.
 */
export declare function parseLockInfo(content: string): LockInfo | null;
/** @public */
export interface TaskStatusEntry {
    taskName: string;
    tier: string;
    phase: string;
    worktree?: string;
    updated: string;
}
/** @public */
export declare function parseStatusEntries(content: string): TaskStatusEntry[];
/** @public */
export declare function serializeStatusEntries(entries: TaskStatusEntry[]): string;
/** @public */
export declare function upsertTaskEntry(entries: TaskStatusEntry[], newEntry: TaskStatusEntry): TaskStatusEntry[];
/** @public */
export declare function removeTaskEntry(entries: TaskStatusEntry[], taskName: string): TaskStatusEntry[];
/** Check whether a task name already exists in the entries list. @public */
export declare function hasTaskName(entries: TaskStatusEntry[], taskName: string): boolean;
