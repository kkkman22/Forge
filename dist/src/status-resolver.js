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
export function slugify(taskName) {
    const lower = taskName.toLowerCase();
    // Keep only ASCII alphanumeric, replace everything else with hyphens
    const replaced = lower.replace(/[^a-z0-9]+/g, "-");
    // Trim leading/trailing hyphens
    const trimmed = replaced.replace(/^-+|-+$/g, "");
    if (trimmed.length === 0) {
        throw new Error(`Cannot slugify task name: "${taskName}" — no ASCII alphanumeric characters found`);
    }
    return trimmed;
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
export function resolveStatusPath(ctx, dirExists) {
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
export function isMultiTaskMode(forgeRoot, dirExists) {
    return dirExists(`${forgeRoot}/status`);
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
export function reconstructStateFromGit(forgeFiles) {
    const hasPlans = forgeFiles.some((f) => f.startsWith("plans/"));
    const hasProgress = forgeFiles.some((f) => f.startsWith("progress/"));
    const hasReviews = forgeFiles.some((f) => f.startsWith("reviews/"));
    const evidence = [];
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
//# sourceMappingURL=status-resolver.js.map