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
// ---------------------------------------------------------------------------
// Branch validation error
// ---------------------------------------------------------------------------
/**
 * Thrown when a branch name fails validation for Ship delivery operations.
 *
 * This indicates a bug in the caller — branch names should be sanitized
 * at creation time and never contain illegal characters at delivery time.
 */
export class BranchValidationError extends Error {
    code = "BRANCH_VALIDATION_ERROR";
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}
// ---------------------------------------------------------------------------
// Shell metacharacter detection
// ---------------------------------------------------------------------------
/**
 * Pattern matching common shell metacharacters that could be dangerous if
 * passed through a shell interpreter.
 *
 * Detects:
 * - Backticks (`` ` ``)
 * - Subshell syntax (`$(…)`)
 * - Double quotes (`"`)
 * - Semicolons (`;`)
 * - Pipe characters (`|`)
 * - Ampersands (`&`)
 * - Angle brackets (`<`, `>`)
 * - Newlines and carriage returns
 */
const SHELL_META_RE = /[`";&|<>]|\$\(|\r|\n/;
/**
 * Check whether a string contains shell metacharacters.
 *
 * This is a detection-only function — it does **not** sanitize. Use it to
 * flag potentially dangerous input before logging or auditing.
 *
 * @param input  The string to inspect.
 * @returns `true` if the input contains at least one shell metacharacter.
 */
export function containsShellMetacharacters(input) {
    return SHELL_META_RE.test(input);
}
// ---------------------------------------------------------------------------
// Branch name sanitization
// ---------------------------------------------------------------------------
/**
 * Pattern matching characters that are illegal in Git branch names.
 *
 * Git branch names may contain alphanumeric characters, hyphens, underscores,
 * forward slashes, and dots. Everything else is stripped — including
 * `~`, `^`, `*`, `[`, `:`, `?`, `\`, `@`, `{`, `}`, control characters,
 * and spaces, which are all forbidden by `git check-ref-format`.
 *
 * Additionally rejects (handled in {@link sanitizeBranchName}):
 * - Consecutive dots (`..`) — path traversal / Git ref restriction
 * - Trailing `.lock` — reserved by Git
 * - Leading/trailing `.`, `/`, or `-`
 * - The `@{` reflog syntax sequence
 */
const ILLEGAL_BRANCH_CHARS_RE = /[^a-zA-Z0-9\-_./]/g;
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
export function sanitizeBranchName(input) {
    let result = input
        // Remove @{ reflog syntax before whitelist strip so neither @ nor { can linger
        .replace(/@\{/g, "")
        // Strip illegal characters (whitelist: alphanumeric, hyphen, underscore, dot, slash)
        .replace(ILLEGAL_BRANCH_CHARS_RE, "")
        // Collapse consecutive dots (prevents ".." path traversal)
        .replace(/\.{2,}/g, ".")
        // Collapse consecutive slashes
        .replace(/\/{2,}/g, "/");
    // Remove trailing ".lock" repeatedly (handles ".lock.lock" etc.)
    while (result.toLowerCase().endsWith(".lock")) {
        result = result.slice(0, -5);
    }
    // Trim leading/trailing dots, slashes, and dashes
    result = result.replace(/^[./-]+/, "").replace(/[./-]+$/, "");
    return result;
}
// ---------------------------------------------------------------------------
// Branch name validation (Ship delivery)
// ---------------------------------------------------------------------------
/**
 * Validate a branch name for Ship delivery operations.
 *
 * Unlike `sanitizeBranchName()` which silently cleans, this function **rejects**
 * invalid names by throwing. Delivery operations should not silently modify
 * branch names — if a name is invalid at this stage, it indicates a bug
 * elsewhere (branch was supposed to be sanitized at creation time).
 *
 * Rejects names containing:
 * - Shell metacharacters (backticks, `$(…)`, `"`, `;`, `|`, `&`, `<`, `>`, newlines)
 * - Git-illegal characters (anything outside `[a-zA-Z0-9\-_./]`)
 * - Empty strings
 *
 * @param branch  The branch name to validate.
 * @throws {ForgeError} If the branch name contains illegal characters.
 */
export function validateBranchName(branch) {
    if (!branch || branch.length === 0) {
        throw new BranchValidationError("Branch name must not be empty");
    }
    if (containsShellMetacharacters(branch)) {
        throw new BranchValidationError(`Branch name contains shell metacharacters: "${branch}"`);
    }
    // Use a fresh regex to avoid sticky lastIndex from the global flag
    if (/[^a-zA-Z0-9\-_./]/.test(branch)) {
        throw new BranchValidationError(`Branch name contains illegal Git characters: "${branch}"`);
    }
    // Reject Git-specific illegal sequences
    if (branch.includes("..") || branch.includes("@{") || branch.toLowerCase().endsWith(".lock")) {
        throw new BranchValidationError(`Branch name contains illegal Git sequence: "${branch}"`);
    }
    // Reject leading/trailing dots, slashes, and dashes
    if (/^[./-]/.test(branch) || /[./-]$/.test(branch)) {
        throw new BranchValidationError(`Branch name has illegal leading/trailing character: "${branch}"`);
    }
}
// ---------------------------------------------------------------------------
// Branch name deduplication
// ---------------------------------------------------------------------------
/** Maximum allowed length for a Git branch name. */
const MAX_BRANCH_NAME_LENGTH = 250;
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
 * `MAX_BRANCH_NAME_LENGTH` (250) characters.
 *
 * @param baseName          The desired branch name (e.g. `forge/my-feature`).
 * @param runId             The unique run identifier (UUID).
 * @param existingBranches  Array of branch names that already exist.
 * @returns A branch name guaranteed to not collide with `existingBranches`
 *          and to be ≤ 250 characters long.
 */
export function deduplicateBranchName(baseName, runId, existingBranches) {
    let candidate = baseName;
    if (existingBranches.includes(baseName)) {
        const suffix = runId.slice(0, 8);
        candidate = `${baseName}-${suffix}`;
    }
    // Enforce the 250-character maximum
    if (candidate.length > MAX_BRANCH_NAME_LENGTH) {
        candidate = candidate.slice(0, MAX_BRANCH_NAME_LENGTH);
    }
    return candidate;
}
// ---------------------------------------------------------------------------
// Path safety validation
// ---------------------------------------------------------------------------
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
export function validatePathSafety(path) {
    // Reject empty paths
    if (path.length === 0) {
        return false;
    }
    // Reject null bytes
    if (path.includes("\0")) {
        return false;
    }
    // Reject directory traversal
    if (path.includes("..")) {
        return false;
    }
    // Reject shell metacharacters
    if (containsShellMetacharacters(path)) {
        return false;
    }
    // Reject leading dashes (could be interpreted as flags)
    if (path.startsWith("-")) {
        return false;
    }
    return true;
}
// ---------------------------------------------------------------------------
// Git command builders
// ---------------------------------------------------------------------------
/**
 * Build a `git commit -m <message>` command.
 *
 * The commit message is passed as a single element in the args array,
 * ensuring it is never shell-interpolated regardless of its content.
 *
 * @param message  The commit message text (may contain any characters).
 * @returns A {@link GitCommand} with `executable: "git"` and the commit args.
 */
export function buildCommitCommand(message) {
    return {
        executable: "git",
        args: ["commit", "-m", message],
    };
}
/**
 * Build a `git reset --hard HEAD` command.
 *
 * Used to rollback the working directory to the last committed state after
 * a failed iteration.
 *
 * @returns A {@link GitCommand} for hard-resetting to HEAD.
 */
export function buildResetCommand() {
    return {
        executable: "git",
        args: ["reset", "--hard", "HEAD"],
    };
}
/**
 * Build a `git clean -fd` command.
 *
 * Removes untracked files and directories. Used in combination with
 * `git reset --hard HEAD` to fully restore the working directory.
 *
 * @returns A {@link GitCommand} for cleaning untracked files.
 */
export function buildCleanCommand() {
    return {
        executable: "git",
        args: ["clean", "-fd"],
    };
}
/**
 * Build a `git add -A` command.
 *
 * Stages all changes (new, modified, and deleted files) for commit.
 * Used before `git commit` to ensure all iteration changes are captured.
 *
 * @returns A {@link GitCommand} for staging all changes.
 */
export function buildAddAllCommand() {
    return {
        executable: "git",
        args: ["add", "-A"],
    };
}
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
export function buildStashCommand(message) {
    return {
        executable: "git",
        args: ["stash", "--include-untracked", "-m", message],
    };
}
/**
 * Build a `git rev-parse stash@{0}` command.
 *
 * Captures the SHA of the most recent stash entry. Used after `git stash`
 * to record the stash ref for recovery purposes during rollback.
 *
 * @returns A {@link GitCommand} for resolving the latest stash ref to a SHA.
 */
export function buildStashRefCommand() {
    return {
        executable: "git",
        args: ["rev-parse", "stash@{0}"],
    };
}
/**
 * Build a `git clean -fdn` command (dry-run variant).
 *
 * Lists untracked files and directories that *would* be removed by
 * `git clean -fd`, without actually deleting anything. Used in dry-run
 * rollback mode to show the operator what would be cleaned.
 *
 * @returns A {@link GitCommand} for dry-run cleaning of untracked files.
 */
export function buildCleanDryRunCommand() {
    return {
        executable: "git",
        args: ["clean", "-fdn"],
    };
}
// ---------------------------------------------------------------------------
// Ship delivery command builders
// ---------------------------------------------------------------------------
/**
 * Build a `git checkout <branch>` command.
 *
 * @param branch  The branch to check out. Validated for safety.
 * @returns A {@link GitCommand} for switching branches.
 */
export function buildCheckoutCommand(branch) {
    validateBranchName(branch);
    return {
        executable: "git",
        args: ["checkout", branch],
    };
}
/**
 * Build a `git merge [--no-ff] <branch>` command.
 *
 * @param branch  The branch to merge. Validated for safety.
 * @param noFf    Whether to use `--no-ff` (no fast-forward).
 * @returns A {@link GitCommand} for merging a branch.
 */
export function buildMergeCommand(branch, noFf) {
    validateBranchName(branch);
    return {
        executable: "git",
        args: noFf ? ["merge", "--no-ff", branch] : ["merge", branch],
    };
}
/**
 * Build a `git branch -d|-D <branch>` command.
 *
 * @param branch  The branch to delete. Validated for safety.
 * @param force   `true` for force-delete (`-D`), `false` for safe delete (`-d`).
 * @returns A {@link GitCommand} for deleting a branch.
 */
export function buildBranchDeleteCommand(branch, force) {
    validateBranchName(branch);
    return {
        executable: "git",
        args: ["branch", force ? "-D" : "-d", branch],
    };
}
/**
 * Build a `git push [-u] <remote> <branch>` command.
 *
 * @param remote       The remote to push to. Checked for shell metacharacters.
 * @param branch       The branch to push. Validated for safety.
 * @param setUpstream  Whether to set the upstream tracking branch (`-u`).
 * @returns A {@link GitCommand} for pushing to a remote.
 */
export function buildPushCommand(remote, branch, setUpstream) {
    validateBranchName(branch);
    if (containsShellMetacharacters(remote)) {
        throw new BranchValidationError(`Remote name contains shell metacharacters: "${remote}"`);
    }
    return {
        executable: "git",
        args: setUpstream ? ["push", "-u", remote, branch] : ["push", remote, branch],
    };
}
/**
 * Build a `git merge --abort` command.
 *
 * Used for error recovery when a merge fails (e.g. due to conflicts).
 * Restores the working directory to the pre-merge state.
 *
 * @returns A {@link GitCommand} for aborting an in-progress merge.
 */
export function buildMergeAbortCommand() {
    return {
        executable: "git",
        args: ["merge", "--abort"],
    };
}
//# sourceMappingURL=git-transaction.js.map