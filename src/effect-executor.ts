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
import { ForgeError } from "./forge-error.js";
import {
  buildAddAllCommand,
  buildBranchDeleteCommand,
  buildCheckoutCommand,
  buildCleanCommand,
  buildCleanDryRunCommand,
  buildCommitCommand,
  buildMergeAbortCommand,
  buildMergeCommand,
  buildPushCommand,
  buildResetCommand,
  buildStashCommand,
  buildStashRefCommand,
} from "./git-transaction.js";
import type { OrchestratorEffect } from "./loop-types.js";
import { checkWritePermission, normalizeForgePath } from "./state.js";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when the inner-layer frozen zone check detects that staged files
 * include locked/approved `.forge/` files. This is a deliberate policy
 * violation — the loop should terminate immediately without triggering
 * exponential backoff.
 *
 * **Validates: Requirements 8.1, 8.2**
 */
export class FrozenZoneViolation extends ForgeError {
  readonly code = "FROZEN_ZONE_VIOLATION" as const;
  readonly files: string[];

  constructor(files: string[]) {
    super(`Frozen zone violation: ${files.join(", ")}`);
    this.files = files;
  }
}

/**
 * Thrown when an effect execution fails for an unexpected reason (e.g. git
 * command crash, I/O error). The loop should treat this as a hard failure
 * and trigger `iteration_hard_failure` with exponential backoff.
 *
 * **Validates: Requirements 8.1, 8.3**
 */
export class UnexpectedEffectError extends ForgeError {
  readonly code = "UNEXPECTED_EFFECT_ERROR" as const;
}

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
  /** When true, rollback logs what would be cleaned without executing destructive operations. */
  dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// EffectExecutorInterface
// ---------------------------------------------------------------------------

/**
 * Public interface for the effect executor.
 *
 * Consumers (e.g. `SdkDriver`) depend on this interface rather than the
 * concrete `EffectExecutor` class, enabling type-safe test doubles that
 * produce compile-time errors when the real interface changes.
 */
export interface EffectExecutorInterface {
  /** Set to `true` when an `abort` effect is executed. */
  aborted: boolean;

  /** Set to `true` when a `stop` effect is executed. */
  stopped: boolean;

  /**
   * Execute a single effect descriptor.
   *
   * @param effect      The effect descriptor to execute.
   * @param abortSignal Optional signal to interrupt long-running effects.
   */
  executeEffect(effect: OrchestratorEffect, abortSignal?: AbortSignal): Promise<void>;

  /**
   * Execute an ordered list of effects sequentially.
   *
   * @param effects     Array of effect descriptors to execute in order.
   * @param abortSignal Optional signal to interrupt long-running effects.
   */
  executeEffects(effects: OrchestratorEffect[], abortSignal?: AbortSignal): Promise<void>;
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
export class EffectExecutor implements EffectExecutorInterface {
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
        this.executeCommit(effect.message, abortSignal);
        return;
      }

      case "rollback": {
        this.executeRollback(abortSignal);
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

      case "ship_merge": {
        this.executeShipMerge(effect.targetBranch, effect.featureBranch);
        return;
      }

      case "ship_push_pr": {
        this.executeShipPushPr(effect.remote, effect.branch, effect.title, effect.body);
        return;
      }

      case "ship_discard": {
        this.executeShipDiscard(effect.branch);
        return;
      }
    }
  }

  /**
   * Execute an ordered list of effects sequentially.
   *
   * Effects are processed in the exact order they appear in the array.
   * No effect is executed before all preceding effects have completed.
   * If the abort signal fires, remaining effects are skipped and an
   * interruption message is logged.
   *
   * @param effects     Array of effect descriptors to execute in order.
   * @param abortSignal Optional signal to interrupt long-running effects.
   */
  async executeEffects(effects: OrchestratorEffect[], abortSignal?: AbortSignal): Promise<void> {
    for (const effect of effects) {
      if (abortSignal?.aborted) {
        this.deps.onLog("Effect execution interrupted: abort signal received");
        return;
      }
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
   * If the abort signal has fired, the commit is skipped entirely and an
   * interruption message is logged.
   *
   * Uses `execFileSync` with argv arrays (no shell) to prevent injection.
   */
  private executeCommit(message: string, abortSignal?: AbortSignal): void {
    if (abortSignal?.aborted) {
      this.deps.onLog("Commit skipped: abort signal received");
      return;
    }

    const addCmd = buildAddAllCommand();
    try {
      execFileSync(addCmd.executable, addCmd.args, {
        cwd: this.deps.cwd,
        timeout: 30_000,
        killSignal: "SIGTERM",
      });
    } catch (err) {
      throw new UnexpectedEffectError(
        `git command "${addCmd.executable} ${addCmd.args.join(" ")}" timed out after 30000ms: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Inner-layer frozen zone check: scan staged files for frozen zone violations.
    // Throws FrozenZoneViolation to signal the driver to terminate the loop
    // immediately without triggering exponential backoff.
    const violations = this.checkStagedFrozenFiles();
    if (violations.length > 0) {
      this.deps.onLog(`⚠️ Inner-layer frozen zone check blocked commit: ${violations.join(", ")}`);
      // Unstage the frozen files to prevent them from being committed
      for (const file of violations) {
        try {
          execFileSync("git", ["reset", "HEAD", "--", file], {
            cwd: this.deps.cwd,
            timeout: 30_000,
            killSignal: "SIGTERM",
          });
        } catch (err) {
          this.deps.onLog?.(
            `[debug] git reset HEAD failed for ${file}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      throw new FrozenZoneViolation(violations);
    }

    const commitCmd = buildCommitCommand(message);
    try {
      execFileSync(commitCmd.executable, commitCmd.args, {
        cwd: this.deps.cwd,
        timeout: 30_000,
        killSignal: "SIGTERM",
      });
    } catch {
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
  private checkStagedFrozenFiles(): string[] {
    const violations: string[] = [];

    try {
      const output = execFileSync("git", ["diff", "--cached", "--name-only"], {
        cwd: this.deps.cwd,
        timeout: 30_000,
        killSignal: "SIGTERM",
      })
        .toString()
        .trim();

      if (!output) return violations;

      for (const file of output.split("\n")) {
        if (!file.includes(".forge/")) continue;

        // Normalize the path using the same logic as the outer-layer check-frozen.ts
        const forgePath = normalizeForgePath(file);

        // Read the staged version of the file to check its status
        try {
          const content = execFileSync("git", ["show", `:${file}`], {
            cwd: this.deps.cwd,
            timeout: 30_000,
            killSignal: "SIGTERM",
          }).toString();

          const result = checkWritePermission(forgePath, content);
          if (result.blocked) {
            violations.push(file);
          }
        } catch {
          // git show :file failed — treat as suspicious and log warning
          this.deps.onLog(`⚠️ Could not read staged version of ${file} — treating as suspicious`);
          violations.push(file);
        }
      }
    } catch (err) {
      // git diff may fail in edge cases — don't block the commit
      this.deps.onLog?.(
        `[debug] git diff --cached failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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
   * If the abort signal has fired, the rollback is skipped entirely and an
   * interruption message is logged.
   *
   * Uses `execFileSync` with argv arrays (no shell) to prevent injection.
   */
  private executeRollback(abortSignal?: AbortSignal): void {
    if (abortSignal?.aborted) {
      this.deps.onLog("Rollback skipped: abort signal received");
      return;
    }

    // Dry-run mode: list files that would be cleaned without performing destructive operations
    if (this.deps.dryRun) {
      this.deps.onLog("Dry-run rollback — listing files that would be cleaned:");
      const dryRunCmd = buildCleanDryRunCommand();
      const output = execFileSync(dryRunCmd.executable, dryRunCmd.args, {
        cwd: this.deps.cwd,
        timeout: 30_000,
        killSignal: "SIGTERM",
      })
        .toString()
        .trim();
      if (output) {
        for (const line of output.split("\n")) {
          this.deps.onLog(`  would remove: ${line.replace(/^Would remove /, "")}`);
        }
      } else {
        this.deps.onLog("  (no untracked files to clean)");
      }
      return; // Skip destructive operations
    }

    // Safety net: stash uncommitted changes before destructive rollback
    try {
      const stashCmd = buildStashCommand("forge-rollback-safety-net");
      execFileSync(stashCmd.executable, stashCmd.args, {
        cwd: this.deps.cwd,
        timeout: 30_000,
        killSignal: "SIGTERM",
      });

      // Capture the stash ref for recovery purposes
      let stashRef: string;
      try {
        const stashRefCmd = buildStashRefCommand();
        stashRef = execFileSync(stashRefCmd.executable, stashRefCmd.args, {
          cwd: this.deps.cwd,
          timeout: 30_000,
          killSignal: "SIGTERM",
        })
          .toString()
          .trim();
      } catch (err) {
        stashRef = "unknown";
        this.deps.onLog?.(
          `[debug] Failed to capture stash ref: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      this.deps.onLog(`Safety stash created before rollback (stash ref: ${stashRef})`);
      this.deps.onNotesUpdate(`Rollback stash ref: ${stashRef}`);
    } catch {
      // Stash may fail if there's nothing to stash — that's fine, continue with rollback
      this.deps.onLog("No changes to stash before rollback (clean working tree)");
    }

    const resetCmd = buildResetCommand();
    execFileSync(resetCmd.executable, resetCmd.args, {
      cwd: this.deps.cwd,
      timeout: 30_000,
      killSignal: "SIGTERM",
    });

    const cleanCmd = buildCleanCommand();
    execFileSync(cleanCmd.executable, cleanCmd.args, {
      cwd: this.deps.cwd,
      timeout: 30_000,
      killSignal: "SIGTERM",
    });
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

  /**
   * Execute a Ship merge: checkout target → merge --no-ff feature → delete feature branch.
   *
   * On merge failure, executes `merge --abort` to restore clean state
   * and throws without deleting the feature branch.
   */
  private executeShipMerge(targetBranch: string, featureBranch: string): void {
    const checkoutCmd = buildCheckoutCommand(targetBranch);
    execFileSync(checkoutCmd.executable, checkoutCmd.args, {
      cwd: this.deps.cwd,
      timeout: 30_000,
      killSignal: "SIGTERM",
    });

    try {
      const mergeCmd = buildMergeCommand(featureBranch, true);
      execFileSync(mergeCmd.executable, mergeCmd.args, {
        cwd: this.deps.cwd,
        timeout: 30_000,
        killSignal: "SIGTERM",
      });
    } catch (mergeError) {
      try {
        const abortCmd = buildMergeAbortCommand();
        execFileSync(abortCmd.executable, abortCmd.args, {
          cwd: this.deps.cwd,
          timeout: 30_000,
          killSignal: "SIGTERM",
        });
      } catch {
        /* merge --abort failure is non-fatal */
      }
      throw new UnexpectedEffectError(
        `Ship merge failed: ${mergeError instanceof Error ? mergeError.message : String(mergeError)}`,
      );
    }

    const deleteCmd = buildBranchDeleteCommand(featureBranch, false);
    execFileSync(deleteCmd.executable, deleteCmd.args, {
      cwd: this.deps.cwd,
      timeout: 30_000,
      killSignal: "SIGTERM",
    });
  }

  /**
   * Execute a Ship push + PR: push to remote with upstream, then create PR via gh CLI.
   *
   * Push failure throws immediately. PR creation failure logs a warning
   * but does NOT throw — the push result is preserved.
   */
  private executeShipPushPr(remote: string, branch: string, title: string, body: string): void {
    const pushCmd = buildPushCommand(remote, branch, true);
    execFileSync(pushCmd.executable, pushCmd.args, {
      cwd: this.deps.cwd,
      timeout: 30_000,
      killSignal: "SIGTERM",
    });

    try {
      execFileSync("gh", ["pr", "create", "--title", title, "--body", body], {
        cwd: this.deps.cwd,
        timeout: 30_000,
        killSignal: "SIGTERM",
      });
    } catch (prError) {
      this.deps.onLog(
        `⚠️ PR creation failed: ${prError instanceof Error ? prError.message : String(prError)}. Branch was pushed successfully.`,
      );
    }
  }

  /**
   * Execute a Ship discard: checkout main → force delete feature branch.
   */
  private executeShipDiscard(branch: string): void {
    const checkoutCmd = buildCheckoutCommand("main");
    execFileSync(checkoutCmd.executable, checkoutCmd.args, {
      cwd: this.deps.cwd,
      timeout: 30_000,
      killSignal: "SIGTERM",
    });

    const deleteCmd = buildBranchDeleteCommand(branch, true);
    execFileSync(deleteCmd.executable, deleteCmd.args, {
      cwd: this.deps.cwd,
      timeout: 30_000,
      killSignal: "SIGTERM",
    });
  }
}
