/**
 * Run lifecycle management — directory setup, notes persistence, branch
 * creation, and worktree orchestration.
 *
 * Encapsulates all file I/O and git operations needed to set up, resume,
 * and maintain autonomous loop runs. Static methods keep the API simple
 * and avoid unnecessary instantiation.
 *
 * Design reference: sdk-autonomous-loop § run-manager.ts
 * **Validates: Requirements 1.3, 7.1, 7.2, 7.3, 7.4, 5.4**
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { formatNotesDocument, parseNotesDocument } from "./context-accumulator.js";
import { deduplicateBranchName, sanitizeBranchName } from "./git-transaction.js";
import { computeWorktreePath } from "./worktree-manager.js";

// ---------------------------------------------------------------------------
// Translation function type
// ---------------------------------------------------------------------------

/** Translation function signature used for i18n support. */
export type TranslateFn = (key: string, params?: Record<string, string>) => string;

// ---------------------------------------------------------------------------
// Branch existence check
// ---------------------------------------------------------------------------

/**
 * Check whether a Git branch already exists in the repository.
 *
 * Uses `git rev-parse --verify` to test for the branch ref. Returns `true`
 * if the branch exists, `false` if the git command fails (branch not found).
 *
 * @param branchName  The full branch name to check (e.g. `forge/my-feature`).
 * @param cwd         Working directory (repository root).
 * @returns `true` if the branch exists, `false` otherwise.
 */
export function branchExists(branchName: string, cwd: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", `refs/heads/${branchName}`], {
      cwd,
      stdio: "pipe",
      timeout: 30_000,
      killSignal: "SIGTERM",
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// File-lock helpers for worktree creation serialization (R2)
// ---------------------------------------------------------------------------

/** Default timeout in milliseconds for acquiring the worktree file lock. */
const LOCK_TIMEOUT_MS = 5_000;

/** Polling interval in milliseconds when waiting for the lock. */
const LOCK_POLL_INTERVAL_MS = 50;

/** Relative path from repo root to the worktree lock file. */
const LOCK_FILE_REL = ".forge/.locks/worktree.lock";

/**
 * Attempt to acquire a file-based lock using `O_CREAT | O_EXCL` for atomic
 * creation. Retries with polling until `timeoutMs` elapses.
 *
 * @param lockPath   Absolute path to the lock file.
 * @param timeoutMs  Maximum time to wait for the lock (default 5 000 ms).
 * @returns The file descriptor on success, or `null` if the lock could not
 *          be acquired within the timeout.
 */
export function acquireFileLock(lockPath: string, timeoutMs = LOCK_TIMEOUT_MS): number | null {
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      // O_CREAT | O_EXCL: create the file only if it does not already exist.
      // This is an atomic operation on POSIX file systems.
      const fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      return fd;
    } catch (err: unknown) {
      // EEXIST means another process holds the lock — retry after a short wait.
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === "EEXIST") {
        if (Date.now() >= deadline) {
          return null; // timeout
        }
        // Busy-wait with a small sleep (synchronous to keep the API simple)
        const waitUntil = Date.now() + LOCK_POLL_INTERVAL_MS;
        while (Date.now() < waitUntil) {
          // spin
        }
        continue;
      }
      // Any other error (e.g. ENOENT for missing directory) — propagate
      throw err;
    }
  }
}

/**
 * Release a previously acquired file lock by closing the descriptor and
 * removing the lock file.
 *
 * @param lockPath  Absolute path to the lock file.
 * @param fd        File descriptor returned by {@link acquireFileLock}.
 */
export function releaseFileLock(lockPath: string, fd: number): void {
  try {
    closeSync(fd);
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: utility function has no logger access
    console.warn(
      `[debug] closeSync failed for lock fd=${fd}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    unlinkSync(lockPath);
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: utility function has no logger access
    console.warn(
      `[debug] unlinkSync failed for lock path=${lockPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of setting up a new or resumed run. */
export interface RunSetup {
  /** Unique identifier for this run. */
  runId: string;
  /** Path to the run directory (e.g. `<cwd>/.forge/runs/<runId>/`). */
  runDir: string;
  /** SHA of the base commit recorded at branch creation. */
  baseCommit: string;
  /** Path to the notes.md file within the run directory. */
  notesPath: string;
  /** Git branch name for this run (e.g. `forge/<slug>`). */
  branchName: string;
}

// ---------------------------------------------------------------------------
// RunManager
// ---------------------------------------------------------------------------

/**
 * Handles run directory setup, notes persistence, branch management,
 * and worktree orchestration.
 *
 * All methods are static — no instance state is needed.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: design specifies a class with static methods for RunManager
export class RunManager {
  /**
   * Set up a new run: generate ID, create branch, run directory, and
   * initial notes file.
   *
   * Steps:
   * 1. Generate a unique run ID via `crypto.randomUUID()`.
   * 2. Sanitize the objective for use as a branch name suffix.
   * 3. If the sanitized name is empty, fall back to `run-<runId prefix>`.
   * 4. Create branch `forge/<sanitizedName>`.
   * 5. Record the base commit (HEAD before branching).
   * 6. Create the run directory and initialize an empty notes file.
   *
   * @param objective  The user-provided objective string.
   * @param cwd        Working directory (repository root).
   * @returns A {@link RunSetup} describing the new run.
   */
  static setupNewRun(objective: string, cwd: string): RunSetup {
    const runId = randomUUID();

    // Sanitize objective for branch name
    let sanitizedName = sanitizeBranchName(objective);
    if (sanitizedName === "") {
      sanitizedName = `run-${runId.slice(0, 8)}`;
    }

    let branchName = `forge/${sanitizedName}`;

    // Check for branch collision and deduplicate if needed
    if (branchExists(branchName, cwd)) {
      branchName = deduplicateBranchName(branchName, runId, [branchName]);
    }

    // Record base commit before creating the branch
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      timeout: 30_000,
      killSignal: "SIGTERM",
    })
      .toString()
      .trim();

    // Create run directory and notes file paths
    const runDir = path.join(cwd, ".forge", "runs", runId);
    const notesPath = path.join(runDir, "notes.md");

    try {
      // Create the new branch
      execFileSync("git", ["checkout", "-b", branchName], {
        cwd,
        timeout: 30_000,
        killSignal: "SIGTERM",
      });
    } catch (error) {
      // Clean up run directory and notes file on branch creation failure
      try {
        if (existsSync(runDir)) {
          rmSync(runDir, { recursive: true, force: true });
        }
      } catch (err) {
        // biome-ignore lint/suspicious/noConsole: utility function has no logger access
        console.warn(
          `[debug] run directory cleanup failed for ${runDir}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      throw error;
    }

    // Create run directory
    mkdirSync(runDir, { recursive: true });

    // Initialize empty notes file
    const initialContent = formatNotesDocument({ runId, branchName, entries: [] });
    writeFileSync(notesPath, initialContent, "utf-8");

    return { runId, runDir, baseCommit, notesPath, branchName };
  }

  /**
   * Resume an existing run on a `forge/` branch.
   *
   * Reads the existing notes document from the run directory, determines
   * the last iteration number from the entries, and returns a setup object
   * augmented with `lastIteration`.
   *
   * @param branchName  The `forge/` branch name to resume.
   * @param cwd         Working directory (repository root).
   * @returns A {@link RunSetup} with an additional `lastIteration` field.
   */
  static resumeRun(branchName: string, cwd: string): RunSetup & { lastIteration: number } {
    // Record current base commit
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      timeout: 30_000,
      killSignal: "SIGTERM",
    })
      .toString()
      .trim();

    // Find the run directory — scan .forge/runs/ for a directory with
    // a notes.md that references this branch or has content
    const runsDir = `${cwd}/.forge/runs/`;
    let runId = "";
    let runDir = "";
    let notesPath = "";
    let lastIteration = 0;

    if (existsSync(runsDir)) {
      // Read directory entries to find the matching run
      const entries = readdirSync(runsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const candidatePath = path.join(runsDir, entry.name, "notes.md");
          if (existsSync(candidatePath)) {
            const content = readFileSync(candidatePath, "utf-8");
            const doc = parseNotesDocument(content);

            // Match by branchName stored in notes metadata
            if (doc.branchName === branchName) {
              runId = doc.runId || entry.name;
              runDir = path.join(runsDir, entry.name);
              notesPath = candidatePath;
              lastIteration =
                doc.entries.length > 0 ? Math.max(...doc.entries.map((e) => e.number)) : 0;
              break;
            }
            // If branchName doesn't match, continue scanning other directories
          }
        }
      }
    }

    // If no existing run found, create a new run directory
    if (runId === "") {
      runId = randomUUID();
      runDir = path.join(runsDir, runId);
      mkdirSync(runDir, { recursive: true });
      notesPath = path.join(runDir, "notes.md");
      const initialContent = formatNotesDocument({ runId, entries: [] });
      writeFileSync(notesPath, initialContent, "utf-8");
    }

    return { runId, runDir, baseCommit, notesPath, branchName, lastIteration };
  }

  /**
   * Persist notes content to disk.
   *
   * @param notesPath  Absolute path to the notes.md file.
   * @param content    The Markdown content to write.
   */
  static persistNotes(notesPath: string, content: string): void {
    writeFileSync(notesPath, content, "utf-8");
  }

  /**
   * Set up a worktree for parallel execution.
   *
   * Computes the worktree path, creates the worktree with a new branch,
   * and initializes the run directory inside the worktree.
   *
   * @param objective      The user-provided objective string.
   * @param repoRoot       Absolute path to the main repository root.
   * @returns A {@link RunSetup} with an additional `worktreePath` field.
   */
  static setupWorktree(
    objective: string,
    repoRoot: string,
    t?: TranslateFn,
  ): RunSetup & { worktreePath: string } {
    const runId = randomUUID();

    // --- File-lock serialization (R2) ---
    // Acquire a file lock to serialize the concurrency check + worktree
    // creation window, preventing TOCTOU races between concurrent callers.
    const lockPath = path.join(repoRoot, LOCK_FILE_REL);
    let lockFd: number | null = null;
    let lockAcquired = false;

    try {
      // Ensure the lock directory exists
      mkdirSync(path.dirname(lockPath), { recursive: true });
      lockFd = acquireFileLock(lockPath);
      if (lockFd === null) {
        throw new Error(
          `Worktree lock timeout: could not acquire ${LOCK_FILE_REL} within ${LOCK_TIMEOUT_MS}ms`,
        );
      }
      lockAcquired = true;
    } catch (lockErr) {
      // If the error is a lock timeout, propagate it (R2.2)
      if (lockErr instanceof Error && lockErr.message.includes("lock timeout")) {
        throw lockErr;
      }
      // For any other lock mechanism failure (e.g. permissions), fall back
      // to lockless mode and warn (R2.4)
      const lockErrMsg = lockErr instanceof Error ? lockErr.message : String(lockErr);
      const warningMsg = t
        ? t("runManager.warning.fileLockFailed", { error: lockErrMsg })
        : `Warning: file-lock mechanism failed, falling back to lockless mode: ${lockErrMsg}`;
      // biome-ignore lint/suspicious/noConsole: utility function has no logger access
      console.warn(warningMsg);
    }

    try {
      // --- Critical section: worktree creation ---

      // Sanitize objective for branch name and worktree slug
      let sanitizedSlug = sanitizeBranchName(objective);
      if (sanitizedSlug === "") {
        sanitizedSlug = `run-${runId.slice(0, 8)}`;
      }

      let branchName = `forge/${sanitizedSlug}`;
      const worktreePath = computeWorktreePath(repoRoot, sanitizedSlug);

      // Check for branch collision and deduplicate if needed
      if (branchExists(branchName, repoRoot)) {
        branchName = deduplicateBranchName(branchName, runId, [branchName]);
      }

      // Record base commit before creating the worktree
      const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        timeout: 30_000,
        killSignal: "SIGTERM",
      })
        .toString()
        .trim();

      // Clean up stale worktree directory left by a previous interrupted run.
      // When a task is stopped mid-creation, the directory remains on disk
      // but is not registered in `git worktree list`, causing "already exists"
      // on retry. Remove it before attempting creation.
      if (existsSync(worktreePath)) {
        rmSync(worktreePath, { recursive: true, force: true });
      }

      // Create worktree with a new branch
      execFileSync("git", ["worktree", "add", worktreePath, "-b", branchName], {
        cwd: repoRoot,
        timeout: 30_000,
        killSignal: "SIGTERM",
      });

      // Create run directory inside the worktree — wrap in try/catch to
      // clean up the worktree if directory initialization fails
      let runDir: string;
      let notesPath: string;
      try {
        runDir = path.join(worktreePath, ".forge", "runs", runId);
        mkdirSync(runDir, { recursive: true });

        // Initialize empty notes file
        notesPath = path.join(runDir, "notes.md");
        const initialContent = formatNotesDocument({ runId, branchName, entries: [] });
        writeFileSync(notesPath, initialContent, "utf-8");
      } catch (initError) {
        // Worktree was created but run directory init failed — remove worktree
        try {
          execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
            cwd: repoRoot,
            timeout: 30_000,
            killSignal: "SIGTERM",
          });
        } catch (err) {
          // biome-ignore lint/suspicious/noConsole: utility function has no logger access
          console.warn(
            `[debug] worktree removal failed for ${worktreePath}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // Clean up the orphan branch created with the worktree (R11)
        let branchCleanupNote = "";
        try {
          execFileSync("git", ["branch", "-D", branchName], {
            cwd: repoRoot,
            timeout: 30_000,
            killSignal: "SIGTERM",
          });
        } catch (branchErr) {
          // Include branch name in error message for manual cleanup (R11.2)
          const branchErrMsg = branchErr instanceof Error ? branchErr.message : String(branchErr);
          branchCleanupNote = ` Failed to delete orphan branch "${branchName}" — manual cleanup required: git branch -D ${branchName} (${branchErrMsg})`;
        }

        const message = initError instanceof Error ? initError.message : String(initError);
        throw new Error(
          `Run directory initialization failed after worktree creation: ${message}. Worktree cleanup attempted.${branchCleanupNote}`,
        );
      }

      return {
        runId,
        runDir,
        baseCommit,
        notesPath,
        branchName,
        worktreePath,
      };
    } finally {
      // Release the file lock in the finally block (R2.3)
      if (lockAcquired && lockFd !== null) {
        releaseFileLock(lockPath, lockFd);
      }
    }
  }
}
