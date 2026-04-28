/**
 * Git transaction management — safe command generation and injection protection.
 *
 * All functions are pure: they build command descriptors (argv arrays) without
 * executing anything. The SKILL layer is responsible for spawning processes
 * via `execFileSync` using the returned {@link GitCommand} objects.
 *
 * User input is always placed into the `args` array as discrete elements,
 * never interpolated into a shell string. This prevents shell injection by
 * construction.
 *
 * Design reference: gnhf-inspired-enhancements § git-transaction.ts
 * **Validates: Requirements 6.1–6.7, 2.1–2.4**
 */
import type { GitCommand } from "./loop-types.js";
/**
 * Check whether a string contains shell metacharacters.
 *
 * This is a detection-only function — it does **not** sanitize. Use it to
 * flag potentially dangerous input before logging or auditing.
 *
 * @param input  The string to inspect.
 * @returns `true` if the input contains at least one shell metacharacter.
 */
export declare function containsShellMetacharacters(input: string): boolean;
/**
 * Sanitize a string for use as a Git branch name.
 *
 * Produces output that passes `git check-ref-format --branch` by:
 * 1. Stripping the `@{` reflog sequence (before whitelist, to avoid residual `{`)
 * 2. Removing all characters outside the `[a-zA-Z0-9\-_./]` whitelist
 * 3. Collapsing consecutive dots and slashes
 * 4. Removing trailing `.lock` suffixes (repeatedly, to handle `.lock.lock`)
 * 5. Trimming leading/trailing `.`, `/`, and `-`
 *
 * @param input  Raw branch name candidate.
 * @returns A cleaned branch name safe for Git.
 */
export declare function sanitizeBranchName(input: string): string;
/**
 * Generate a unique branch name by appending a deduplication suffix when
 * the base name collides with an existing branch.
 *
 * This is a **pure function**: it takes the candidate name, a run ID, and
 * the list of existing branch names, and returns a unique name without
 * performing any I/O.
 *
 * When a collision is detected, the first 8 characters of the `runId` are
 * appended as a `-<suffix>`. The final name is truncated to
 * {@link MAX_BRANCH_NAME_LENGTH} characters.
 *
 * @param baseName          The desired branch name (e.g. `forge/my-feature`).
 * @param runId             The unique run identifier (UUID).
 * @param existingBranches  Array of branch names that already exist.
 * @returns A branch name guaranteed to not collide with `existingBranches`
 *          and to be ≤ 250 characters long.
 */
export declare function deduplicateBranchName(baseName: string, runId: string, existingBranches: string[]): string;
/**
 * Validate that a file path does not contain injection patterns.
 *
 * Rejects paths containing:
 * - `..` (directory traversal)
 * - Null bytes (`\0`)
 * - Shell metacharacters (backticks, `$()`, etc.)
 * - Leading dashes (could be interpreted as command flags)
 *
 * @param path  The file path to validate.
 * @returns `true` if the path is safe, `false` if it contains injection patterns.
 */
export declare function validatePathSafety(path: string): boolean;
/**
 * Build a `git commit -m <message>` command.
 *
 * The commit message is passed as a single element in the args array,
 * ensuring it is never shell-interpolated regardless of its content.
 *
 * @param message  The commit message text (may contain any characters).
 * @returns A {@link GitCommand} with `executable: "git"` and the commit args.
 */
export declare function buildCommitCommand(message: string): GitCommand;
/**
 * Build a `git reset --hard HEAD` command.
 *
 * Used to rollback the working directory to the last committed state after
 * a failed iteration.
 *
 * @returns A {@link GitCommand} for hard-resetting to HEAD.
 */
export declare function buildResetCommand(): GitCommand;
/**
 * Build a `git clean -fd` command.
 *
 * Removes untracked files and directories. Used in combination with
 * `git reset --hard HEAD` to fully restore the working directory.
 *
 * @returns A {@link GitCommand} for cleaning untracked files.
 */
export declare function buildCleanCommand(): GitCommand;
/**
 * Build a `git add -A` command.
 *
 * Stages all changes (new, modified, and deleted files) for commit.
 * Used before `git commit` to ensure all iteration changes are captured.
 *
 * @returns A {@link GitCommand} for staging all changes.
 */
export declare function buildAddAllCommand(): GitCommand;
/**
 * Build a `git stash --include-untracked -m <message>` command.
 *
 * Creates a stash entry that includes untracked files, tagged with the
 * given message. Used as a safety net before destructive operations like
 * `git reset --hard` to preserve uncommitted work.
 *
 * @param message  A descriptive label for the stash entry.
 * @returns A {@link GitCommand} for stashing all changes including untracked files.
 */
export declare function buildStashCommand(message: string): GitCommand;
/**
 * Build a `git rev-parse stash@{0}` command.
 *
 * Captures the SHA of the most recent stash entry. Used after `git stash`
 * to record the stash ref for recovery purposes during rollback.
 *
 * @returns A {@link GitCommand} for resolving the latest stash ref to a SHA.
 */
export declare function buildStashRefCommand(): GitCommand;
/**
 * Build a `git clean -fdn` command (dry-run variant).
 *
 * Lists untracked files and directories that *would* be removed by
 * `git clean -fd`, without actually deleting anything. Used in dry-run
 * rollback mode to show the operator what would be cleaned.
 *
 * @returns A {@link GitCommand} for dry-run cleaning of untracked files.
 */
export declare function buildCleanDryRunCommand(): GitCommand;
