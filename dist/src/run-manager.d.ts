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
/** Translation function signature used for i18n support. */
export type TranslateFn = (key: string, params?: Record<string, string>) => string;
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
export declare function branchExists(branchName: string, cwd: string): boolean;
/**
 * Attempt to acquire a file-based lock using `O_CREAT | O_EXCL` for atomic
 * creation. Retries with polling until `timeoutMs` elapses.
 *
 * @param lockPath   Absolute path to the lock file.
 * @param timeoutMs  Maximum time to wait for the lock (default 5 000 ms).
 * @returns The file descriptor on success, or `null` if the lock could not
 *          be acquired within the timeout.
 */
export declare function acquireFileLock(lockPath: string, timeoutMs?: number): number | null;
/**
 * Release a previously acquired file lock by closing the descriptor and
 * removing the lock file.
 *
 * @param lockPath  Absolute path to the lock file.
 * @param fd        File descriptor returned by {@link acquireFileLock}.
 */
export declare function releaseFileLock(lockPath: string, fd: number): void;
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
/**
 * Handles run directory setup, notes persistence, branch management,
 * and worktree orchestration.
 *
 * All methods are static — no instance state is needed.
 */
export declare class RunManager {
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
    static setupNewRun(objective: string, cwd: string): RunSetup;
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
    static resumeRun(branchName: string, cwd: string): RunSetup & {
        lastIteration: number;
    };
    /**
     * Persist notes content to disk.
     *
     * @param notesPath  Absolute path to the notes.md file.
     * @param content    The Markdown content to write.
     */
    static persistNotes(notesPath: string, content: string): void;
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
    static setupWorktree(objective: string, repoRoot: string, t?: TranslateFn): RunSetup & {
        worktreePath: string;
    };
}
