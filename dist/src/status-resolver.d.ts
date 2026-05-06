/**
 * Status Resolver — path resolution and mode detection for parallel status tracking.
 *
 * Provides:
 *   - slugify: Convert task names to filesystem-safe identifiers
 *   - resolveStatusPath: Determine status file path based on execution context
 *   - isMultiTaskMode: Check if multi-task mode is active
 */
/**
 * Convert a task name to a URL-safe, filesystem-safe identifier.
 *
 * Rules:
 *   1. Lowercase
 *   2. Remove non-ASCII-alphanumeric characters (CJK etc.)
 *   3. Replace spaces and special characters with hyphens
 *   4. Collapse consecutive hyphens
 *   5. Trim leading/trailing hyphens
 *
 * @throws Error if input is empty or contains no ASCII alphanumeric characters
 */
export declare function slugify(taskName: string): string;
export interface ResolverContext {
    /** Current task name (human-readable). */
    taskName: string;
    /** .forge root directory path. */
    forgeRoot: string;
}
export interface ResolvedStatus {
    /** Full path to the status file. */
    filePath: string;
    /** Current mode: "single" for legacy, "multi" for parallel tasks. */
    mode: "single" | "multi";
    /** Task ID (slugified task name). */
    taskId: string;
}
/**
 * Resolve the status file path for a given task.
 *
 * Mode detection:
 *   - If .forge/status/ directory exists → multi mode
 *   - Otherwise → single mode
 *
 * Path resolution:
 *   - single mode → .forge/status.md
 *   - multi mode → .forge/status/<task-id>.md
 *
 * @param ctx - Resolver context with task name and forge root
 * @param dirExists - DI function to check if .forge/status/ directory exists
 */
export declare function resolveStatusPath(ctx: ResolverContext, dirExists: (path: string) => boolean): ResolvedStatus;
/**
 * Check if multi-task mode is active based on the presence of .forge/status/ directory.
 *
 * @param forgeRoot - Path to the .forge directory
 * @param dirExists - DI function to check directory existence
 */
export declare function isMultiTaskMode(forgeRoot: string, dirExists: (path: string) => boolean): boolean;
/** Result of reconstructing state from git history and file presence. */
export interface ReconstructedState {
    inferredPhase: string;
    confidence: "high" | "medium" | "low";
    evidence: string[];
}
/**
 * Infer current workflow phase from .forge/ file presence.
 *
 * Pure function — no side effects, no file writes.
 * Inference priority: reviews/ > progress/ > plans/ > router.
 *
 * Called by forge-resume when StatusFile is missing or inconsistent.
 * Reconstructed state is presented to the user for confirmation,
 * NOT automatically written to disk.
 */
export declare function reconstructStateFromGit(forgeFiles: string[]): ReconstructedState;
