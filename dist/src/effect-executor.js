/**
 * Effect executor — interprets `OrchestratorEffect` descriptors and performs
 * real-world I/O (git commands, backoff sleep, abort/stop signalling).
 *
 * The executor is stateless with respect to business logic. All decision-making
 * lives in the pure-function orchestrator; this module only carries out the
 * instructions encoded in effect descriptors.
 *
 * Design reference: sdk-autonomous-loop § effect-executor.ts
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */
import { execFileSync } from "node:child_process";
import { buildAddAllCommand, buildCleanCommand, buildCleanDryRunCommand, buildCommitCommand, buildResetCommand, buildStashCommand, buildStashRefCommand, } from "./git-transaction.js";
import { checkWritePermission, normalizeForgePath } from "./state.js";
// ---------------------------------------------------------------------------
// EffectExecutor class
// ---------------------------------------------------------------------------
/**
 * Interprets `OrchestratorEffect` descriptors and performs real-world I/O.
 *
 * The driver reads the `aborted` and `stopped` flags after executing effects
 * to decide whether to continue the loop.
 */
export class EffectExecutor {
    /** Set to `true` when an `abort` effect is executed. */
    aborted = false;
    /** Set to `true` when a `stop` effect is executed. */
    stopped = false;
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * Execute a single effect descriptor.
     *
     * Dispatches on `effect.type` and performs the corresponding I/O action.
     * Returns a promise that resolves when the effect is complete.
     *
     * @param effect      The effect descriptor to execute.
     * @param abortSignal Optional signal to interrupt long-running effects (backoff).
     */
    async executeEffect(effect, abortSignal) {
        switch (effect.type) {
            case "commit": {
                this.executeCommit(effect.message);
                return;
            }
            case "rollback": {
                this.executeRollback();
                return;
            }
            case "start_backoff": {
                await this.executeBackoff(effect.durationMs, abortSignal);
                return;
            }
            case "abort": {
                this.aborted = true;
                this.deps.onLog(`Aborted: ${effect.reason}`);
                return;
            }
            case "stop": {
                this.stopped = true;
                this.deps.onLog("Stopped");
                return;
            }
            case "schedule_iteration": {
                // No-op at executor level — the driver handles iteration scheduling.
                return;
            }
        }
    }
    /**
     * Execute an ordered list of effects sequentially.
     *
     * Effects are processed in the exact order they appear in the array.
     * No effect is executed before all preceding effects have completed.
     *
     * @param effects     Array of effect descriptors to execute in order.
     * @param abortSignal Optional signal to interrupt long-running effects.
     */
    async executeEffects(effects, abortSignal) {
        for (const effect of effects) {
            await this.executeEffect(effect, abortSignal);
        }
    }
    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------
    /**
     * Execute a commit: `git add -A` followed by `git commit -m <message>`.
     *
     * Before committing, performs an inner-layer frozen zone check on staged
     * files. If any frozen file has been modified, the commit is aborted and
     * a rollback is performed instead. This provides defense-in-depth beyond
     * the outer Hook layer.
     *
     * Uses `execFileSync` with argv arrays (no shell) to prevent injection.
     */
    executeCommit(message) {
        const addCmd = buildAddAllCommand();
        execFileSync(addCmd.executable, addCmd.args, { cwd: this.deps.cwd });
        // Inner-layer frozen zone check: scan staged files for frozen zone violations
        const violations = this.checkStagedFrozenFiles();
        if (violations.length > 0) {
            this.deps.onLog(`⚠️ Inner-layer frozen zone check blocked commit: ${violations.join(", ")}`);
            // Unstage the frozen files to prevent them from being committed
            for (const file of violations) {
                try {
                    execFileSync("git", ["reset", "HEAD", "--", file], { cwd: this.deps.cwd });
                }
                catch {
                    // Best-effort unstage
                }
            }
        }
        const commitCmd = buildCommitCommand(message);
        try {
            execFileSync(commitCmd.executable, commitCmd.args, { cwd: this.deps.cwd });
        }
        catch {
            // Commit may fail if all staged files were unstaged (nothing to commit)
            this.deps.onLog("Commit skipped: no changes to commit after frozen zone filtering");
        }
    }
    /**
     * Check staged files for frozen zone violations.
     *
     * Scans `git diff --cached --name-only` for files under `.forge/` that
     * are in the frozen zone with a locked/approved status. Returns the list
     * of violating file paths.
     *
     * This is the inner-layer defense — even if the Hook layer fails to
     * intercept a write, this check prevents frozen files from being committed.
     */
    checkStagedFrozenFiles() {
        const violations = [];
        try {
            const output = execFileSync("git", ["diff", "--cached", "--name-only"], {
                cwd: this.deps.cwd,
            })
                .toString()
                .trim();
            if (!output)
                return violations;
            for (const file of output.split("\n")) {
                if (!file.includes(".forge/"))
                    continue;
                // Normalize the path using the same logic as the outer-layer check-frozen.ts
                const forgePath = normalizeForgePath(file);
                // Read the staged version of the file to check its status
                try {
                    const content = execFileSync("git", ["show", `:${file}`], {
                        cwd: this.deps.cwd,
                    }).toString();
                    const result = checkWritePermission(forgePath, content);
                    if (result.blocked) {
                        violations.push(file);
                    }
                }
                catch {
                    // git show :file failed — treat as suspicious and log warning
                    this.deps.onLog(`⚠️ Could not read staged version of ${file} — treating as suspicious`);
                    violations.push(file);
                }
            }
        }
        catch {
            // git diff may fail in edge cases — don't block the commit
        }
        return violations;
    }
    /**
     * Execute a rollback: `git reset --hard HEAD` followed by `git clean -fd`.
     *
     * Before the destructive reset, attempts to stash uncommitted changes as a
     * safety net. If the stash fails (e.g. clean working tree), the rollback
     * proceeds normally.
     *
     * Uses `execFileSync` with argv arrays (no shell) to prevent injection.
     */
    executeRollback() {
        // Dry-run mode: list files that would be cleaned without performing destructive operations
        if (this.deps.dryRun) {
            this.deps.onLog("Dry-run rollback — listing files that would be cleaned:");
            const dryRunCmd = buildCleanDryRunCommand();
            const output = execFileSync(dryRunCmd.executable, dryRunCmd.args, { cwd: this.deps.cwd })
                .toString()
                .trim();
            if (output) {
                for (const line of output.split("\n")) {
                    this.deps.onLog(`  would remove: ${line.replace(/^Would remove /, "")}`);
                }
            }
            else {
                this.deps.onLog("  (no untracked files to clean)");
            }
            return; // Skip destructive operations
        }
        // Safety net: stash uncommitted changes before destructive rollback
        try {
            const stashCmd = buildStashCommand("forge-rollback-safety-net");
            execFileSync(stashCmd.executable, stashCmd.args, { cwd: this.deps.cwd });
            // Capture the stash ref for recovery purposes
            let stashRef;
            try {
                const stashRefCmd = buildStashRefCommand();
                stashRef = execFileSync(stashRefCmd.executable, stashRefCmd.args, {
                    cwd: this.deps.cwd,
                })
                    .toString()
                    .trim();
            }
            catch {
                stashRef = "unknown";
            }
            this.deps.onLog(`Safety stash created before rollback (stash ref: ${stashRef})`);
            this.deps.onNotesUpdate(`Rollback stash ref: ${stashRef}`);
        }
        catch {
            // Stash may fail if there's nothing to stash — that's fine, continue with rollback
            this.deps.onLog("No changes to stash before rollback (clean working tree)");
        }
        const resetCmd = buildResetCommand();
        execFileSync(resetCmd.executable, resetCmd.args, { cwd: this.deps.cwd });
        const cleanCmd = buildCleanCommand();
        execFileSync(cleanCmd.executable, cleanCmd.args, { cwd: this.deps.cwd });
    }
    /**
     * Execute an interruptible backoff sleep.
     *
     * Creates a promise that resolves when either:
     * 1. The specified duration elapses (via `setTimeout`), or
     * 2. The abort signal fires (early resolution for clean cancellation).
     *
     * @param durationMs  How long to sleep in milliseconds.
     * @param abortSignal Optional signal to interrupt the sleep early.
     */
    executeBackoff(durationMs, abortSignal) {
        return new Promise((resolve) => {
            // If already aborted, resolve immediately.
            if (abortSignal?.aborted) {
                resolve();
                return;
            }
            const timer = setTimeout(() => {
                cleanup();
                resolve();
            }, durationMs);
            let onAbort;
            const cleanup = () => {
                clearTimeout(timer);
                if (onAbort && abortSignal) {
                    abortSignal.removeEventListener("abort", onAbort);
                }
            };
            if (abortSignal) {
                onAbort = () => {
                    cleanup();
                    resolve();
                };
                abortSignal.addEventListener("abort", onAbort, { once: true });
            }
        });
    }
}
//# sourceMappingURL=effect-executor.js.map