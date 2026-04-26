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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { formatNotesDocument, parseNotesDocument } from "./context-accumulator.js";
import { sanitizeBranchName } from "./git-transaction.js";
import { canCreateWorktree, computeWorktreePath } from "./worktree-manager.js";

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

    const branchName = `forge/${sanitizedName}`;

    // Record base commit before creating the branch
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd }).toString().trim();

    // Create the new branch
    execFileSync("git", ["checkout", "-b", branchName], { cwd });

    // Create run directory
    const runDir = `${cwd}/.forge/runs/${runId}/`;
    mkdirSync(runDir, { recursive: true });

    // Initialize empty notes file
    const notesPath = `${runDir}notes.md`;
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
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd }).toString().trim();

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
          const candidatePath = `${runsDir}${entry.name}/notes.md`;
          if (existsSync(candidatePath)) {
            const content = readFileSync(candidatePath, "utf-8");
            const doc = parseNotesDocument(content);

            // Match by branchName stored in notes metadata
            if (doc.branchName === branchName) {
              runId = doc.runId || entry.name;
              runDir = `${runsDir}${entry.name}/`;
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
      runDir = `${runsDir}${runId}/`;
      mkdirSync(runDir, { recursive: true });
      notesPath = `${runDir}notes.md`;
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
   * Checks the concurrency limit, computes the worktree path, creates
   * the worktree with a new branch, and initializes the run directory
   * inside the worktree.
   *
   * @param objective      The user-provided objective string.
   * @param repoRoot       Absolute path to the main repository root.
   * @param maxConcurrent  Maximum number of concurrent worktrees allowed.
   * @returns A {@link RunSetup} with an additional `worktreePath` field.
   */
  static setupWorktree(
    objective: string,
    repoRoot: string,
    maxConcurrent: number,
  ): RunSetup & { worktreePath: string } {
    const runId = randomUUID();

    // Count active worktrees
    const worktreeOutput = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: repoRoot,
    })
      .toString()
      .trim();

    // Count worktree entries (each starts with "worktree ")
    const activeCount = worktreeOutput
      ? worktreeOutput.split("\n").filter((line) => line.startsWith("worktree ")).length
      : 0;

    // Check concurrency limit (subtract 1 for the main worktree)
    const additionalWorktrees = activeCount > 0 ? activeCount - 1 : 0;
    if (!canCreateWorktree(additionalWorktrees, maxConcurrent)) {
      throw new Error(
        `Cannot create worktree: ${additionalWorktrees} active worktree(s) already exist (limit: ${maxConcurrent})`,
      );
    }

    // Sanitize objective for branch name and worktree slug
    let sanitizedSlug = sanitizeBranchName(objective);
    if (sanitizedSlug === "") {
      sanitizedSlug = `run-${runId.slice(0, 8)}`;
    }

    const branchName = `forge/${sanitizedSlug}`;
    const worktreePath = computeWorktreePath(repoRoot, sanitizedSlug);

    // Record base commit before creating the worktree
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
    })
      .toString()
      .trim();

    // Create worktree with a new branch
    execFileSync("git", ["worktree", "add", worktreePath, "-b", branchName], { cwd: repoRoot });

    // Create run directory inside the worktree
    const runDir = `${worktreePath}.forge/runs/${runId}/`;
    mkdirSync(runDir, { recursive: true });

    // Initialize empty notes file
    const notesPath = `${runDir}notes.md`;
    const initialContent = formatNotesDocument({ runId, branchName, entries: [] });
    writeFileSync(notesPath, initialContent, "utf-8");

    return {
      runId,
      runDir,
      baseCommit,
      notesPath,
      branchName,
      worktreePath,
    };
  }
}
