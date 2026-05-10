/**
 * Worktree lifecycle management — path computation, cleanup decisions,
 * concurrency limits, and source branch validation.
 *
 * All functions are pure: they accept parameters and return values without
 * performing I/O or spawning processes. The SKILL layer is responsible for
 * executing actual Git worktree commands.
 *
 * Design reference: gnhf-inspired-enhancements § worktree-manager.ts
 * **Validates: Requirements 7.1–7.7**
 */
import path from "node:path";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Suffix appended to the repo basename to form the worktree root directory. */
const WORKTREE_DIR_SUFFIX = "-forge-worktrees";
/** Default maximum number of concurrent worktrees. */
const DEFAULT_MAX_CONCURRENT = 3;
/** Pattern that detects path traversal sequences. */
const PATH_TRAVERSAL_PATTERN = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
// ---------------------------------------------------------------------------
// Path computation (Requirements 7.1)
// ---------------------------------------------------------------------------
/**
 * Compute the root directory that holds all worktrees for a given repo.
 *
 * Returns `<parent(repoRoot)>/<basename(repoRoot)>-forge-worktrees/`.
 *
 * Uses POSIX-style path operations for consistent cross-platform behaviour.
 * The result never contains `..` or other path traversal patterns.
 *
 * @param repoRoot  Absolute path to the repository root.
 * @returns The worktree root directory path (with trailing slash).
 */
export function computeWorktreeDir(repoRoot) {
    const parent = path.posix.dirname(repoRoot);
    const base = path.posix.basename(repoRoot);
    const dir = path.posix.join(parent, `${base}${WORKTREE_DIR_SUFFIX}`);
    // Safety: ensure no path traversal in the computed result
    if (PATH_TRAVERSAL_PATTERN.test(dir)) {
        throw new Error(`Computed worktree directory contains path traversal: ${dir}`);
    }
    return `${dir}/`;
}
/**
 * Compute the full path for a specific worktree identified by its slug.
 *
 * Returns `<parent(repoRoot)>/<basename(repoRoot)>-forge-worktrees/<slug>/`.
 *
 * Uses POSIX-style path operations for consistent cross-platform behaviour.
 * The result never contains `..` or other path traversal patterns.
 *
 * @param repoRoot  Absolute path to the repository root.
 * @param slug      URL-safe slug identifying this worktree.
 * @returns The full worktree path (with trailing slash).
 */
export function computeWorktreePath(repoRoot, slug) {
    const worktreeDir = computeWorktreeDir(repoRoot);
    // Strip trailing slash from worktreeDir before joining, then re-add it
    const dirWithoutSlash = worktreeDir.slice(0, -1);
    const fullPath = path.posix.join(dirWithoutSlash, slug);
    // Safety: ensure no path traversal in the computed result
    if (PATH_TRAVERSAL_PATTERN.test(fullPath)) {
        throw new Error(`Computed worktree path contains path traversal: ${fullPath}`);
    }
    return `${fullPath}/`;
}
// ---------------------------------------------------------------------------
// Lifecycle decisions (Requirements 7.3, 7.4)
// ---------------------------------------------------------------------------
/**
 * Decide whether to preserve or remove a worktree after a run completes.
 *
 * When `shipOption` is provided, the decision accounts for the Ship delivery
 * option to avoid duplicate branch operations:
 * - **merge/discard**: Ship already deleted the branch; remove worktree only.
 * - **push-pr/keep-branch**: Branch is still in use; preserve worktree.
 *
 * When `shipOption` is undefined (non-Ship context), falls back to the
 * original commitCount-based logic:
 * - **commitCount > 0**: preserve the worktree for review and merge.
 * - **commitCount === 0**: remove the worktree to free resources.
 *
 * @param commitCount  Number of commits made during the run.
 * @param shipOption   Optional Ship delivery option for coordination.
 * @returns A {@link WorktreeDecision} describing the action and reason.
 */
export function decideWorktreeCleanup(commitCount, shipOption) {
    if (shipOption === "merge" || shipOption === "discard") {
        return {
            action: "remove",
            reason: shipOption === "merge"
                ? "Ship merged and deleted branch; removing worktree only"
                : "Ship discarded branch; removing worktree only",
        };
    }
    if (shipOption === "push-pr" || shipOption === "keep-branch") {
        return {
            action: "preserve",
            reason: "Branch still in use (pushed/kept); preserving worktree",
        };
    }
    // Original logic for non-Ship context
    if (commitCount > 0) {
        return {
            action: "preserve",
            reason: `Worktree has ${commitCount} commit(s) to review and merge`,
        };
    }
    return {
        action: "remove",
        reason: "Worktree has no commits; removing to free resources",
    };
}
// ---------------------------------------------------------------------------
// Concurrency limits (Requirements 7.5)
// ---------------------------------------------------------------------------
/**
 * Check whether a new worktree can be created given the current active count.
 *
 * Returns `true` when `activeCount` is strictly less than `maxConcurrent`.
 *
 * @param activeCount    Number of currently active worktrees.
 * @param maxConcurrent  Maximum allowed concurrent worktrees. Defaults to 3.
 * @returns Whether a new worktree may be created.
 */
export function canCreateWorktree(activeCount, maxConcurrent = DEFAULT_MAX_CONCURRENT) {
    return activeCount < maxConcurrent;
}
// ---------------------------------------------------------------------------
// Source branch validation (Requirements 7.7)
// ---------------------------------------------------------------------------
/**
 * Validate that the current branch is a valid source for worktree creation.
 *
 * Worktrees must be created from a non-forge branch (typically `main`) to
 * prevent nested worktree creation. Returns `false` when the branch name
 * starts with `"forge/"`.
 *
 * @param currentBranch  The name of the currently checked-out branch.
 * @returns Whether the branch is a valid worktree source.
 */
export function isValidWorktreeSource(currentBranch) {
    return !currentBranch.startsWith("forge/");
}
// ---------------------------------------------------------------------------
// Active worktree counting (branch-isolation-recommendation)
// ---------------------------------------------------------------------------
/**
 * Count additional (non-main) worktrees from `git worktree list --porcelain` output.
 *
 * Returns `max(0, worktreeLineCount - 1)` since the main working tree
 * is always listed first.
 *
 * @param porcelainOutput  Raw output from `git worktree list --porcelain`.
 * @returns Number of additional worktrees beyond the main one.
 * @public
 */
export function countActiveWorktrees(porcelainOutput) {
    if (!porcelainOutput || porcelainOutput.trim() === "")
        return 0;
    const worktreeLines = porcelainOutput.split("\n").filter((line) => line.startsWith("worktree "));
    return Math.max(0, worktreeLines.length - 1);
}
//# sourceMappingURL=worktree-manager.js.map