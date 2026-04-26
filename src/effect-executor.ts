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
import {
  buildAddAllCommand,
  buildCleanCommand,
  buildCommitCommand,
  buildResetCommand,
  buildStashCommand,
} from "./git-transaction.js";
import type { OrchestratorEffect } from "./loop-types.js";

// ---------------------------------------------------------------------------
// Dependencies interface
// ---------------------------------------------------------------------------

/**
 * Dependencies injected into the effect executor.
 *
 * Keeps the executor decoupled from concrete I/O implementations, making
 * it straightforward to test with stubs.
 */
export interface EffectExecutorDeps {
  /** Working directory for git commands. */
  cwd: string;
  /** Callback to persist notes content after updates. */
  onNotesUpdate: (content: string) => void;
  /** Callback for logging messages. */
  onLog: (message: string) => void;
}

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

  private readonly deps: EffectExecutorDeps;

  constructor(deps: EffectExecutorDeps) {
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
  async executeEffect(effect: OrchestratorEffect, abortSignal?: AbortSignal): Promise<void> {
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
  async executeEffects(effects: OrchestratorEffect[], abortSignal?: AbortSignal): Promise<void> {
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
   * Uses `execFileSync` with argv arrays (no shell) to prevent injection.
   */
  private executeCommit(message: string): void {
    const addCmd = buildAddAllCommand();
    execFileSync(addCmd.executable, addCmd.args, { cwd: this.deps.cwd });

    const commitCmd = buildCommitCommand(message);
    execFileSync(commitCmd.executable, commitCmd.args, { cwd: this.deps.cwd });
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
  private executeRollback(): void {
    // Safety net: stash uncommitted changes before destructive rollback
    try {
      const stashCmd = buildStashCommand("forge-rollback-safety-net");
      execFileSync(stashCmd.executable, stashCmd.args, { cwd: this.deps.cwd });
      this.deps.onLog("Safety stash created before rollback (use 'git stash pop' to recover)");
    } catch {
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
  private executeBackoff(durationMs: number, abortSignal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      // If already aborted, resolve immediately.
      if (abortSignal?.aborted) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, durationMs);

      let onAbort: (() => void) | undefined;

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
