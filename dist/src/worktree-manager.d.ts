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
import type { ShipDeliveryOption } from "./execution-mode.js";
import type { WorktreeDecision } from "./loop-types.js";
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
export declare function computeWorktreeDir(repoRoot: string): string;
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
export declare function computeWorktreePath(repoRoot: string, slug: string): string;
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
export declare function decideWorktreeCleanup(commitCount: number, shipOption?: ShipDeliveryOption): WorktreeDecision;
/**
 * Check whether a new worktree can be created given the current active count.
 *
 * Returns `true` when `activeCount` is strictly less than `maxConcurrent`.
 *
 * @param activeCount    Number of currently active worktrees.
 * @param maxConcurrent  Maximum allowed concurrent worktrees. Defaults to 3.
 * @returns Whether a new worktree may be created.
 */
export declare function canCreateWorktree(activeCount: number, maxConcurrent?: number): boolean;
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
export declare function isValidWorktreeSource(currentBranch: string): boolean;
