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

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { startup } from "@anthropic-ai/claude-agent-sdk";
import { Command } from "commander";

import { buildAgentOutputSchema } from "./agent-output.js";
import { EffectExecutor } from "./effect-executor.js";
import type { LoopConfig, RunLimits } from "./loop-types.js";
import { RunManager } from "./run-manager.js";
import { SdkAgentAdapter } from "./sdk-agent-adapter.js";
import { SdkDriver } from "./sdk-driver.js";
import { buildSleepPreventionCommand } from "./sleep-preventer.js";
import { decideWorktreeCleanup, isValidWorktreeSource } from "./worktree-manager.js";

// ---------------------------------------------------------------------------
// CLI options interface
// ---------------------------------------------------------------------------

interface CliOptions {
  maxIterations?: number;
  maxTokens?: number;
  stopWhen?: string;
  preventSleep: string;
  worktree: boolean;
  maxBudgetUsd?: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
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
    .action(async (objective: string, opts: CliOptions) => {
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
      } catch {
        console.error("Error: Current directory is not a Git repository.");
        process.exit(1);
      }

      if (!useWorktree) {
        const status = execFileSync("git", ["status", "--porcelain"], {
          cwd,
          encoding: "utf-8",
        }).trim();

        if (status !== "") {
          console.error(
            "Error: Working tree is not clean. Commit or stash changes before running, or use --worktree.",
          );
          process.exit(1);
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
          console.error(
            "Error: Cannot create a worktree from a forge/ branch. Switch to main or another non-forge branch first.",
          );
          process.exit(1);
        }
      }

      // ---------------------------------------------------------------
      // Build LoopConfig and RunLimits
      // ---------------------------------------------------------------
      const loopConfig: LoopConfig = {
        agent: "claude",
        maxConsecutiveFailures: 3,
        preventSleep,
        backoffBaseMs: 60_000,
        maxConcurrentWorktrees: 3,
      };

      const limits: RunLimits = {
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
      // Set up run (new run or worktree)
      // ---------------------------------------------------------------
      let runSetup: ReturnType<typeof RunManager.setupNewRun>;
      let worktreePath: string | undefined;
      let effectiveCwd = cwd;

      if (useWorktree) {
        const worktreeSetup = RunManager.setupWorktree(
          objective,
          cwd,
          loopConfig.maxConcurrentWorktrees,
        );
        runSetup = worktreeSetup;
        worktreePath = worktreeSetup.worktreePath;
        effectiveCwd = worktreeSetup.worktreePath;
      } else {
        runSetup = RunManager.setupNewRun(objective, cwd);
      }

      // ---------------------------------------------------------------
      // Spawn sleep prevention process
      // ---------------------------------------------------------------
      let sleepProcess: ChildProcess | null = null;

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
        onNotesUpdate: (content: string) => {
          RunManager.persistNotes(runSetup.notesPath, content);
        },
        onLog: (message: string) => {
          console.log(message);
        },
      });

      const driver = new SdkDriver(
        {
          objective,
          loopConfig,
          limits,
          cwd: effectiveCwd,
          runId: runSetup.runId,
          runDir: runSetup.runDir,
          warmQuery,
          baseCommit: runSetup.baseCommit,
          notesPath: runSetup.notesPath,
        },
        effectExecutor,
        agentAdapter,
      );

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
        RunManager.persistNotes(
          runSetup.notesPath,
          result.notesDocument.entries.length > 0 ? JSON.stringify(result.notesDocument) : "",
        );

        // Handle worktree cleanup.
        if (useWorktree && worktreePath) {
          const decision = decideWorktreeCleanup(result.commitCount);
          if (decision.action === "remove") {
            try {
              execFileSync("git", ["worktree", "remove", worktreePath], {
                cwd,
                stdio: "pipe",
              });
              console.log(`Worktree removed: ${decision.reason}`);
            } catch (cleanupError) {
              console.error(
                `Failed to remove worktree at ${worktreePath}:`,
                cleanupError instanceof Error ? cleanupError.message : cleanupError,
              );
            }
          } else {
            console.log(`Worktree preserved: ${decision.reason}`);
          }
        }
      } finally {
        // Clean up signal handlers.
        process.removeListener("SIGINT", handleSignal);
        process.removeListener("SIGTERM", handleSignal);

        // Kill sleep prevention process.
        if (sleepProcess) {
          try {
            sleepProcess.kill();
          } catch (cleanupError) {
            console.error(
              "Failed to kill sleep prevention process:",
              cleanupError instanceof Error ? cleanupError.message : cleanupError,
            );
          }
        }

        // Close SDK client.
        try {
          await agentAdapter.close();
        } catch (cleanupError) {
          console.error(
            "Failed to close SDK agent adapter:",
            cleanupError instanceof Error ? cleanupError.message : cleanupError,
          );
        }
      }
    });

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
