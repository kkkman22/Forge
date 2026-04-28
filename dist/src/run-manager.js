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
import { closeSync, constants, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { formatNotesDocument, parseNotesDocument } from "./context-accumulator.js";
import { deduplicateBranchName, sanitizeBranchName } from "./git-transaction.js";
import { canCreateWorktree, computeWorktreePath } from "./worktree-manager.js";
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
export function branchExists(branchName, cwd) {
    try {
        execFileSync("git", ["rev-parse", "--verify", `refs/heads/${branchName}`], {
            cwd,
            stdio: "pipe",
        });
        return true;
    }
    catch {
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
export function acquireFileLock(lockPath, timeoutMs = LOCK_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
        try {
            // O_CREAT | O_EXCL: create the file only if it does not already exist.
            // This is an atomic operation on POSIX file systems.
            const fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
            return fd;
        }
        catch (err) {
            // EEXIST means another process holds the lock — retry after a short wait.
            if (err instanceof Error && err.code === "EEXIST") {
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
export function releaseFileLock(lockPath, fd) {
    try {
        closeSync(fd);
    }
    catch {
        // Best-effort close
    }
    try {
        unlinkSync(lockPath);
    }
    catch {
        // Best-effort removal — the file may already have been deleted
    }
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
    static setupNewRun(objective, cwd) {
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
        const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd }).toString().trim();
        // Create run directory and notes file paths
        const runDir = path.join(cwd, ".forge", "runs", runId);
        const notesPath = path.join(runDir, "notes.md");
        try {
            // Create the new branch
            execFileSync("git", ["checkout", "-b", branchName], { cwd });
        }
        catch (error) {
            // Clean up run directory and notes file on branch creation failure
            try {
                if (existsSync(runDir)) {
                    rmSync(runDir, { recursive: true, force: true });
                }
            }
            catch {
                // Cleanup is best-effort
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
    static resumeRun(branchName, cwd) {
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
    static persistNotes(notesPath, content) {
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
    static setupWorktree(objective, repoRoot, maxConcurrent) {
        const runId = randomUUID();
        // --- File-lock serialization (R2) ---
        // Acquire a file lock to serialize the concurrency check + worktree
        // creation window, preventing TOCTOU races between concurrent callers.
        const lockPath = path.join(repoRoot, LOCK_FILE_REL);
        let lockFd = null;
        let lockAcquired = false;
        try {
            // Ensure the lock directory exists
            mkdirSync(path.dirname(lockPath), { recursive: true });
            lockFd = acquireFileLock(lockPath);
            if (lockFd === null) {
                throw new Error(`Worktree lock timeout: could not acquire ${LOCK_FILE_REL} within ${LOCK_TIMEOUT_MS}ms`);
            }
            lockAcquired = true;
        }
        catch (lockErr) {
            // If the error is a lock timeout, propagate it (R2.2)
            if (lockErr instanceof Error && lockErr.message.includes("lock timeout")) {
                throw lockErr;
            }
            // For any other lock mechanism failure (e.g. permissions), fall back
            // to lockless mode and warn (R2.4)
            console.warn(`Warning: file-lock mechanism failed, falling back to lockless mode: ${lockErr instanceof Error ? lockErr.message : String(lockErr)}`);
        }
        try {
            // --- Critical section: concurrency check + worktree creation ---
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
                throw new Error(`Cannot create worktree: ${additionalWorktrees} active worktree(s) already exist (limit: ${maxConcurrent})`);
            }
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
            })
                .toString()
                .trim();
            // Create worktree with a new branch
            execFileSync("git", ["worktree", "add", worktreePath, "-b", branchName], { cwd: repoRoot });
            // Create run directory inside the worktree — wrap in try/catch to
            // clean up the worktree if directory initialization fails
            let runDir;
            let notesPath;
            try {
                runDir = path.join(worktreePath, ".forge", "runs", runId);
                mkdirSync(runDir, { recursive: true });
                // Initialize empty notes file
                notesPath = path.join(runDir, "notes.md");
                const initialContent = formatNotesDocument({ runId, branchName, entries: [] });
                writeFileSync(notesPath, initialContent, "utf-8");
            }
            catch (initError) {
                // Worktree was created but run directory init failed — remove worktree
                try {
                    execFileSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoRoot });
                }
                catch {
                    // Worktree removal is best-effort
                }
                // Clean up the orphan branch created with the worktree (R11)
                let branchCleanupNote = "";
                try {
                    execFileSync("git", ["branch", "-D", branchName], { cwd: repoRoot });
                }
                catch (branchErr) {
                    // Include branch name in error message for manual cleanup (R11.2)
                    const branchErrMsg = branchErr instanceof Error ? branchErr.message : String(branchErr);
                    branchCleanupNote = ` Failed to delete orphan branch "${branchName}" — manual cleanup required: git branch -D ${branchName} (${branchErrMsg})`;
                }
                const message = initError instanceof Error ? initError.message : String(initError);
                throw new Error(`Run directory initialization failed after worktree creation: ${message}. Worktree cleanup attempted.${branchCleanupNote}`);
            }
            return {
                runId,
                runDir,
                baseCommit,
                notesPath,
                branchName,
                worktreePath,
            };
        }
        finally {
            // Release the file lock in the finally block (R2.3)
            if (lockAcquired && lockFd !== null) {
                releaseFileLock(lockPath, lockFd);
            }
        }
    }
}
//# sourceMappingURL=run-manager.js.map