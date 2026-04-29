/**
 * Status Resolver — path resolution and mode detection for parallel status tracking.
 *
 * Provides:
 *   - slugify: Convert task names to filesystem-safe identifiers
 *   - resolveStatusPath: Determine status file path based on execution context
 *   - isMultiTaskMode: Check if multi-task mode is active
 */

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

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
export function slugify(taskName: string): string {
  const lower = taskName.toLowerCase();
  // Keep only ASCII alphanumeric, replace everything else with hyphens
  const replaced = lower.replace(/[^a-z0-9]+/g, "-");
  // Trim leading/trailing hyphens
  const trimmed = replaced.replace(/^-+|-+$/g, "");

  if (trimmed.length === 0) {
    throw new Error(
      `Cannot slugify task name: "${taskName}" — no ASCII alphanumeric characters found`,
    );
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// resolveStatusPath
// ---------------------------------------------------------------------------

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
export function resolveStatusPath(
  ctx: ResolverContext,
  dirExists: (path: string) => boolean,
): ResolvedStatus {
  const taskId = slugify(ctx.taskName);
  const statusDir = `${ctx.forgeRoot}/status`;

  if (dirExists(statusDir)) {
    return {
      filePath: `${statusDir}/${taskId}.md`,
      mode: "multi",
      taskId,
    };
  }

  return {
    filePath: `${ctx.forgeRoot}/status.md`,
    mode: "single",
    taskId,
  };
}

// ---------------------------------------------------------------------------
// isMultiTaskMode
// ---------------------------------------------------------------------------

/**
 * Check if multi-task mode is active based on the presence of .forge/status/ directory.
 *
 * @param forgeRoot - Path to the .forge directory
 * @param dirExists - DI function to check directory existence
 */
export function isMultiTaskMode(
  forgeRoot: string,
  dirExists: (path: string) => boolean,
): boolean {
  return dirExists(`${forgeRoot}/status`);
}
