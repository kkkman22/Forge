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
 * @public
 */
export function slugify(taskName: string): string {
  const lower = taskName.toLowerCase();
  // Keep only ASCII alphanumeric, replace everything else with hyphens
  const replaced = lower.replace(/[^a-z0-9]+/g, "-");
  // Trim leading/trailing hyphens
  const trimmed = replaced.replace(/^-+|-+$/g, "");

  if (trimmed.length === 0) {
    throw new Error(`slugify: input "${taskName}" produces empty slug`);
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @public */
export interface ResolverContext {
  /** Current task name (human-readable). */
  taskName: string;
  /** .forge root directory path. */
  forgeRoot: string;
}

/** @public */
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
 *   - If .tinkerman/status/ directory exists → multi mode
 *   - Otherwise → single mode
 *
 * Path resolution:
 *   - single mode → .tinkerman/status.md
 *   - multi mode → .tinkerman/status/<task-id>.md
 *
 * @param ctx - Resolver context with task name and forge root
 * @param dirExists - DI function to check if .tinkerman/status/ directory exists
 * @public
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
 * Check if multi-task mode is active based on the presence of .tinkerman/status/ directory.
 *
 * @param forgeRoot - Path to the .forge directory
 * @param dirExists - DI function to check directory existence
 * @public
 */
export function isMultiTaskMode(forgeRoot: string, dirExists: (path: string) => boolean): boolean {
  return dirExists(`${forgeRoot}/status`);
}

// ---------------------------------------------------------------------------
// State reconstruction from git (State Resilience Layer 3)
// ---------------------------------------------------------------------------

/**
 * Result of reconstructing state from git history and file presence.
 * @public
 */
export interface ReconstructedState {
  inferredPhase: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
}

/**
 * Infer current workflow phase from .tinkerman/ file presence.
 *
 * Pure function — no side effects, no file writes.
 * Inference priority: reviews/ > progress/ > plans/ > router.
 *
 * Called by forge-resume when StatusFile is missing or inconsistent.
 * Reconstructed state is presented to the user for confirmation,
 * NOT automatically written to disk.
 * @public
 */
export function reconstructStateFromGit(forgeFiles: string[]): ReconstructedState {
  const hasPlans = forgeFiles.some((f) => f.startsWith("plans/"));
  const hasProgress = forgeFiles.some((f) => f.startsWith("progress/"));
  const hasReviews = forgeFiles.some((f) => f.startsWith("reviews/"));

  const evidence: string[] = [];

  if (hasReviews) {
    evidence.push("found reviews/ files → at least review phase");
    return { inferredPhase: "review", confidence: "high", evidence };
  }
  if (hasProgress) {
    evidence.push("found progress/ files → at least build phase");
    return { inferredPhase: "build", confidence: "high", evidence };
  }
  if (hasPlans) {
    evidence.push("found plans/ files → at least plan phase");
    return { inferredPhase: "plan", confidence: "medium", evidence };
  }

  evidence.push("no state files found → starting from router");
  return { inferredPhase: "router", confidence: "low", evidence };
}
