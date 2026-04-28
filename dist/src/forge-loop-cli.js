#!/usr/bin/env node
/**
 * CLI entry point — Commander-based program that parses arguments, validates
 * preconditions, sets up the run, and starts the autonomous loop driver.
 *
 * Responsibilities:
 * - Parse positional `objective` and named options
 * - Validate git repo state (clean working tree, valid branch for worktree)
 * - Pre-warm the Agent SDK via `startup()`
 * - Spawn sleep prevention process if enabled
 * - Wire signal handlers for graceful shutdown
 * - Start the driver loop and handle cleanup on exit
 *
 * Design reference: sdk-autonomous-loop § forge-loop-cli.ts
 * **Validates: Requirements 1.4, 1.6, 6.1–6.10, 4.5, 4.6, 4.7**
 */
import { startup } from "@anthropic-ai/claude-agent-sdk";
import { Command } from "commander";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildAgentOutputSchema } from "./agent-output.js";
import { CliError } from "./cli-error.js";
import { formatNotesDocument } from "./context-accumulator.js";
import { EffectExecutor } from "./effect-executor.js";
import { branchExists, RunManager } from "./run-manager.js";
import { SdkAgentAdapter } from "./sdk-agent-adapter.js";
import { detectSkillAwareMode, SdkDriver } from "./sdk-driver.js";
import { buildSleepPreventionCommand } from "./sleep-preventer.js";
import { decideWorktreeCleanup, isValidWorktreeSource } from "./worktree-manager.js";
// ---------------------------------------------------------------------------
// PUA task type validation
// ---------------------------------------------------------------------------
/** Known PUA task types for --pua-task-type validation. */
const VALID_PUA_TASK_TYPES = new Set([
    "debug",
    "build",
    "research",
    "architecture",
    "performance",
    "review",
    "deploy",
    "general",
]);
// ---------------------------------------------------------------------------
// Worktree notes backup (R4)
// ---------------------------------------------------------------------------
/**
 * Copy the notes file from a worktree to the main repo's run directory
 * before the worktree is deleted.
 *
 * This ensures iteration history is preserved even when the worktree is
 * removed after a zero-commit run. On any failure (missing source file,
 * permission error, etc.) the function returns `{ success: false }` with
 * an error description — callers should warn but not block worktree
 * deletion.
 *
 * @param worktreeNotesPath  Absolute path to the notes.md inside the worktree.
 * @param mainRepoRunDir     Absolute path to the main repo `.forge/runs/<runId>/` directory.
 * @returns `{ success: true }` on success, `{ success: false, error }` on failure.
 */
export function backupWorktreeNotes(worktreeNotesPath, mainRepoRunDir) {
    try {
        if (!existsSync(worktreeNotesPath)) {
            return { success: false, error: `Notes file not found: ${worktreeNotesPath}` };
        }
        // Ensure the destination directory exists in the main repo
        mkdirSync(mainRepoRunDir, { recursive: true });
        const destPath = path.join(mainRepoRunDir, "notes.md");
        copyFileSync(worktreeNotesPath, destPath);
        return { success: true };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
    }
}
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const program = new Command();
    program
        .name("forge-loop")
        .description("Run an autonomous loop with Claude Code Agent SDK")
        .argument("<objective>", "The objective for the autonomous loop")
        .option("--max-iterations <n>", "Maximum number of iterations", parseInt)
        .option("--max-tokens <n>", "Maximum cumulative token limit", parseInt)
        .option("--stop-when <condition>", "Natural-language stop condition")
        .option("--prevent-sleep <on|off>", "Control sleep prevention", "on")
        .option("--worktree", "Run in a separate Git worktree", false)
        .option("--max-budget-usd <amount>", "Maximum dollar budget", parseFloat)
        .option("--tier <tier>", "Preset routing tier (light|standard|full)")
        .option("--type <type>", "Preset task type (frontend|backend|fullstack|data|infra|docs)")
        .option("--phase <phase>", "Preset project phase (greenfield|iteration|refactor|bugfix)")
        .option("--nature <nature>", "Preset work nature (feature|refactor|bugfix)")
        .option("--pua", "Enable PUA Quality Engine", false)
        .option("--pua-task-type <type>", "PUA task type (debug|build|research|architecture|performance|review|deploy|general)")
        .option("--resume <branchName>", "Resume an existing run on a forge/ branch")
        .action(async (objective, opts) => {
        const cwd = process.cwd();
        const preventSleep = opts.preventSleep !== "off";
        const useWorktree = opts.worktree;
        // ---------------------------------------------------------------
        // Validate git repo and working tree
        // ---------------------------------------------------------------
        try {
            execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
                cwd,
                stdio: "pipe",
            });
        }
        catch {
            throw new CliError("Error: Current directory is not a Git repository.");
        }
        if (!useWorktree && !opts.resume) {
            const status = execFileSync("git", ["status", "--porcelain"], {
                cwd,
                encoding: "utf-8",
            }).trim();
            if (status !== "") {
                throw new CliError("Error: Working tree is not clean. Commit or stash changes before running, or use --worktree.");
            }
        }
        // ---------------------------------------------------------------
        // Validate worktree source branch
        // ---------------------------------------------------------------
        if (useWorktree) {
            const currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
                cwd,
                encoding: "utf-8",
            }).trim();
            if (!isValidWorktreeSource(currentBranch)) {
                throw new CliError("Error: Cannot create a worktree from a forge/ branch. Switch to main or another non-forge branch first.");
            }
        }
        // ---------------------------------------------------------------
        // Detect Skill-aware mode and validate .forge/ directory
        // ---------------------------------------------------------------
        const hasForgeDir = detectSkillAwareMode(cwd);
        const hasSkillOptions = !!(opts.tier || opts.type || opts.phase || opts.nature);
        const skillAware = hasForgeDir || hasSkillOptions;
        if (!hasForgeDir && hasSkillOptions) {
            throw new CliError("Error: --tier, --type, --phase, and --nature require a .forge/ directory. Run `forge init` first.");
        }
        // ---------------------------------------------------------------
        // Build LoopConfig and RunLimits
        // ---------------------------------------------------------------
        const loopConfig = {
            agent: "claude",
            maxConsecutiveFailures: 3,
            preventSleep,
            backoffBaseMs: 60_000,
            maxConcurrentWorktrees: 3,
        };
        const limits = {
            maxIterations: opts.maxIterations,
            maxTokens: opts.maxTokens,
            stopWhen: opts.stopWhen,
        };
        // ---------------------------------------------------------------
        // Pre-warm Agent SDK
        // ---------------------------------------------------------------
        const warmQuery = await startup();
        // ---------------------------------------------------------------
        // Build output schema
        // ---------------------------------------------------------------
        const outputSchema = buildAgentOutputSchema({
            includeStopField: !!opts.stopWhen,
        });
        // ---------------------------------------------------------------
        // Create SdkAgentAdapter
        // ---------------------------------------------------------------
        const agentAdapter = new SdkAgentAdapter({
            warmQuery,
            outputSchema,
            maxBudgetUsd: opts.maxBudgetUsd,
        });
        // ---------------------------------------------------------------
        // Set up run (new run, worktree, or resume)
        // ---------------------------------------------------------------
        let runSetup;
        let worktreePath;
        let effectiveCwd = cwd;
        if (opts.resume) {
            // --resume <branchName>: restore an existing run (R13)
            const resumeBranch = opts.resume;
            // Validate that the branch exists
            if (!branchExists(resumeBranch, cwd)) {
                throw new CliError(`Error: Branch "${resumeBranch}" does not exist. Cannot resume.`);
            }
            // Checkout the branch before resuming
            execFileSync("git", ["checkout", resumeBranch], { cwd, stdio: "pipe" });
            // Restore run context and notes
            const resumed = RunManager.resumeRun(resumeBranch, cwd);
            // Validate that a matching run directory was found (runId is not
            // a freshly generated UUID — resumeRun creates a new one when no
            // existing run matches, but the notes will be empty)
            if (resumed.lastIteration === 0) {
                // Check if the run directory actually had notes — a lastIteration
                // of 0 with an existing notes file that has content is still valid
                // (first iteration may not have completed). We only error when the
                // run directory itself could not be found for this branch.
                const notesContent = readFileSync(resumed.notesPath, "utf-8");
                if (!notesContent.includes(resumeBranch)) {
                    throw new CliError(`Error: No run directory found for branch "${resumeBranch}". Cannot resume.`);
                }
            }
            runSetup = resumed;
            console.log(`Resuming run ${resumed.runId} on branch ${resumeBranch} from iteration ${resumed.lastIteration}`);
        }
        else if (useWorktree) {
            const worktreeSetup = RunManager.setupWorktree(objective, cwd, loopConfig.maxConcurrentWorktrees);
            runSetup = worktreeSetup;
            worktreePath = worktreeSetup.worktreePath;
            effectiveCwd = worktreeSetup.worktreePath;
        }
        else {
            runSetup = RunManager.setupNewRun(objective, cwd);
        }
        // ---------------------------------------------------------------
        // Spawn sleep prevention process
        // ---------------------------------------------------------------
        let sleepProcess = null;
        if (preventSleep) {
            const sleepCmd = buildSleepPreventionCommand(process.platform, process.pid);
            if (sleepCmd) {
                sleepProcess = spawn(sleepCmd.command, sleepCmd.args, {
                    detached: sleepCmd.detached,
                    stdio: "ignore",
                });
                // Unref so the sleep process doesn't keep the event loop alive.
                sleepProcess.unref();
            }
        }
        // ---------------------------------------------------------------
        // Create EffectExecutor and SdkDriver
        // ---------------------------------------------------------------
        const effectExecutor = new EffectExecutor({
            cwd: effectiveCwd,
            onNotesUpdate: (content) => {
                RunManager.persistNotes(runSetup.notesPath, content);
            },
            onLog: (message) => {
                console.log(message);
            },
        });
        const driver = new SdkDriver({
            objective,
            loopConfig,
            limits,
            cwd: effectiveCwd,
            runId: runSetup.runId,
            runDir: runSetup.runDir,
            warmQuery,
            baseCommit: runSetup.baseCommit,
            notesPath: runSetup.notesPath,
            branchName: runSetup.branchName,
            presetTier: opts.tier,
            presetTaskType: opts.type,
            presetProjectPhase: opts.phase,
            presetWorkNature: opts.nature,
            skillAware,
            puaEnabled: opts.pua === true,
            puaTaskType: opts.puaTaskType && VALID_PUA_TASK_TYPES.has(opts.puaTaskType)
                ? opts.puaTaskType
                : opts.pua
                    ? "general"
                    : undefined,
        }, effectExecutor, agentAdapter);
        // ---------------------------------------------------------------
        // Wire signal handlers
        // ---------------------------------------------------------------
        const handleSignal = () => {
            driver.requestStop();
        };
        process.on("SIGINT", handleSignal);
        process.on("SIGTERM", handleSignal);
        // ---------------------------------------------------------------
        // Run the driver loop
        // ---------------------------------------------------------------
        try {
            const result = await driver.run();
            // Persist final notes.
            RunManager.persistNotes(runSetup.notesPath, result.notesDocument.entries.length > 0 ? formatNotesDocument(result.notesDocument) : "");
            // Handle worktree cleanup.
            if (useWorktree && worktreePath) {
                const decision = decideWorktreeCleanup(result.commitCount);
                if (decision.action === "remove") {
                    // Backup notes from worktree to main repo before deletion (R4)
                    const mainRepoRunDir = path.join(cwd, ".forge", "runs", runSetup.runId);
                    const worktreeNotesPath = runSetup.notesPath;
                    const backupResult = backupWorktreeNotes(worktreeNotesPath, mainRepoRunDir);
                    if (!backupResult.success) {
                        console.warn(`Warning: Failed to backup worktree notes: ${backupResult.error}`);
                    }
                    try {
                        execFileSync("git", ["worktree", "remove", worktreePath], {
                            cwd,
                            stdio: "pipe",
                        });
                        console.log(`Worktree removed: ${decision.reason}`);
                    }
                    catch (cleanupError) {
                        console.error(`Failed to remove worktree at ${worktreePath}:`, cleanupError instanceof Error ? cleanupError.message : cleanupError);
                    }
                }
                else {
                    console.log(`Worktree preserved: ${decision.reason}`);
                }
            }
        }
        finally {
            // Clean up signal handlers.
            process.removeListener("SIGINT", handleSignal);
            process.removeListener("SIGTERM", handleSignal);
            // Kill sleep prevention process.
            if (sleepProcess) {
                try {
                    sleepProcess.kill();
                }
                catch (cleanupError) {
                    console.error("Failed to kill sleep prevention process:", cleanupError instanceof Error ? cleanupError.message : cleanupError);
                }
            }
            // Close SDK client.
            try {
                await agentAdapter.close();
            }
            catch (cleanupError) {
                console.error("Failed to close SDK agent adapter:", cleanupError instanceof Error ? cleanupError.message : cleanupError);
            }
        }
    });
    await program.parseAsync(process.argv);
}
main().catch((err) => {
    if (err instanceof CliError) {
        console.error(err.message);
        process.exit(err.exitCode);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
});
//# sourceMappingURL=forge-loop-cli.js.map