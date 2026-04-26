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
export function containsShellMetacharacters(input: string): boolean {
  return SHELL_META_RE.test(input);
}

// ---------------------------------------------------------------------------
// Branch name sanitization
// ---------------------------------------------------------------------------

/**
 * Pattern matching characters that are illegal in Git branch names.
 *
 * Git branch names may contain alphanumeric characters, hyphens, underscores,
 * forward slashes, and dots. Everything else is stripped.
 *
 * Additionally rejects:
 * - Consecutive dots (`..`) — path traversal
 * - Trailing `.lock` — reserved by Git
 * - Leading/trailing slashes or dots
 * - Control characters and spaces
 */
const ILLEGAL_BRANCH_CHARS_RE = /[^a-zA-Z0-9\-_./]/g;

/**
 * Sanitize a string for use as a Git branch name.
 *
 * Removes characters not valid in branch names (keeps alphanumeric, hyphens,
 * underscores, forward slashes, and dots). Also collapses consecutive dots
 * and slashes, and trims leading/trailing dots, slashes, and dashes.
 *
 * @param input  Raw branch name candidate.
 * @returns A cleaned branch name safe for Git.
 */
export function sanitizeBranchName(input: string): string {
  let result = input
    // Strip illegal characters
    .replace(ILLEGAL_BRANCH_CHARS_RE, "")
    // Collapse consecutive dots (prevents ".." path traversal)
    .replace(/\.{2,}/g, ".")
    // Collapse consecutive slashes
    .replace(/\/{2,}/g, "/")
    // Remove ".lock" suffix (reserved by Git)
    .replace(/\.lock$/i, "")
    // Remove control sequences like @{ (reflog syntax)
    .replace(/@\{/g, "");

  // Trim leading/trailing dots, slashes, and dashes
  result = result.replace(/^[./-]+/, "").replace(/[./-]+$/, "");

  return result;
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
export function validatePathSafety(path: string): boolean {
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
export function buildCommitCommand(message: string): GitCommand {
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
export function buildResetCommand(): GitCommand {
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
export function buildCleanCommand(): GitCommand {
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
export function buildAddAllCommand(): GitCommand {
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
export function buildStashCommand(message: string): GitCommand {
  return {
    executable: "git",
    args: ["stash", "--include-untracked", "-m", message],
  };
}
