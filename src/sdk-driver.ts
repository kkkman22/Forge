/** SDK Driver — thin orchestrating shell that delegates to extracted modules. */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type CompletionContext, formatCompletionSummary } from "./completion-reporter.js";
import { formatNotesDocument } from "./context-accumulator.js";
import type { EffectExecutorInterface } from "./effect-executor.js";
import { HooksProtectionMissingError } from "./forge-error.js";
import { createLogEntry, createLogSink } from "./logger/index.js";
import type {
  AgentInterface,
  NotesDocument,
  OrchestratorEffect,
  OrchestratorState,
} from "./loop-types.js";
import { createInitialState, transition } from "./orchestrator.js";
import { PerformanceTracker } from "./performance-tracker.js";
import { PuaStateManager } from "./pua-state-manager.js";
import { executeSkillAwareIteration as executeSkillAwareIterationFn } from "./sdk-skill-iteration.js";
import {
  clearLoopFieldsOnShutdown,
  initializeLoopFields,
  type StatusFileIO,
  safeReadStatusFile,
} from "./sdk-status-helpers.js";

// Re-exports for backward-compatible import paths.
export type { SdkDriverConfig, SdkDriverResult } from "./sdk-driver-types.js";
export { validateHooksPresence } from "./sdk-hooks-validation.js";
export { detectSkillAwareMode } from "./sdk-skill-detection.js";

import { writeEvent } from "./event-writer.js";
import type {
  IterationContext,
  IterationResult,
  SdkDriverConfig,
  SdkDriverResult,
  SkillIterationContext,
} from "./sdk-driver-types.js";
import { executeGenericIteration as executeGenericIterationFn } from "./sdk-generic-iteration.js";
import { validateHooksPresence } from "./sdk-hooks-validation.js";
import { loadSandboxPolicy } from "./sdk-sandbox-policy.js";

/**
 * Core autonomous loop driver — bridges the state machine with real I/O.
 * @public
 */
export class SdkDriver {
  private readonly config: SdkDriverConfig;
  private readonly effectExecutor: EffectExecutorInterface;
  private readonly agentAdapter: AgentInterface;

  private orchestratorState: OrchestratorState;
  private notesDocument: NotesDocument;
  private notesContent: string;

  /** The most recent set of effects from the last transition. */
  private lastEffects: OrchestratorEffect[] = [];

  /** AbortController for the current iteration's agent invocation. */
  private currentAbortController: AbortController | null = null;

  /** Flag indicating requestStop() has been called. */
  private stopRequested = false;

  /** Cleanup promise from requestStop(), awaitable by callers. */
  private stopPromise: Promise<void> | null = null;

  /** Counter for consecutive review-fix loop iterations (skill-aware mode). */
  private reviewFixAttempts = 0;

  /** Tracks whether the loop completed normally (SkillScheduler returned "completed"). */
  private loopCompletedNormally = false;

  /** PUA state manager (only instantiated when puaEnabled is true). */
  private readonly puaStateManager: PuaStateManager | null = null;

  /** StatusFile I/O interface for delegating to helper functions. */
  private readonly statusFileIO: StatusFileIO | undefined;

  /** Structured logger for observability. */
  private readonly logger: ReturnType<typeof createLogSink>;

  /** Performance tracker for iteration/subagent timing and degradation detection. */
  private readonly perfTracker: PerformanceTracker;

  /** Events_NDJSON log path (cmux integration). */
  private readonly eventsPath: string;

  constructor(
    config: SdkDriverConfig,
    effectExecutor: EffectExecutorInterface,
    agentAdapter: AgentInterface,
  ) {
    // Validate objective is non-empty.
    if (!config.objective.trim()) {
      throw new Error("Objective must be a non-empty string");
    }

    this.config = { ...config, skillAware: config.skillAware ?? false };
    this.effectExecutor = effectExecutor;
    this.agentAdapter = agentAdapter;
    this.logger = createLogSink(config.logSinkConfig ?? { format: "text", level: "info" });
    this.perfTracker = new PerformanceTracker(this.logger, config.runId);
    this.eventsPath = path.join(config.runDir ?? config.cwd, ".forge", "events.ndjson");
    this.orchestratorState = createInitialState();
    this.notesDocument = { runId: config.runId, branchName: config.branchName, entries: [] };
    this.notesContent = formatNotesDocument(this.notesDocument);

    // Initialize StatusFile IO interface.
    this.statusFileIO =
      config.readStatusFile && config.writeStatusFile
        ? { read: config.readStatusFile, write: config.writeStatusFile }
        : undefined;

    // Initialize PUA state manager if enabled.
    if (config.puaEnabled) {
      this.puaStateManager = new PuaStateManager(
        {
          readStatusFile: () => safeReadStatusFile(this.statusFileIO),
          writeStatusFile: (content) => {
            if (this.statusFileIO) this.statusFileIO.write(content);
          },
          warn: (msg) =>
            this.logger.log(
              createLogEntry("pua_warning", "warn", msg, { runId: this.config.runId }),
            ),
        },
        config.puaTaskType ?? "general",
      );
    }
  }

  /** Translation helper — falls back to key when no t() is configured. */
  private t(key: string, params?: Record<string, string>): string {
    return this.config.t ? this.config.t(key, params) : key;
  }

  /** Append an event to the NDJSON log (cmux integration). */
  private emitEvent(type: string, payload: Record<string, unknown> = {}): void {
    writeEvent(this.eventsPath, type, { run_id: this.config.runId, ...payload });
  }

  /** Run the autonomous loop until a termination condition is met. */
  async run(): Promise<SdkDriverResult> {
    // Hooks validation — fail-closed: throw when protection is missing
    // unless explicitly overridden with forceNoHooks.
    const hooksResult = validateHooksPresence(this.config.cwd);
    if (!hooksResult.valid) {
      if (this.config.sdkNativeSandbox) {
        // SDK native sandbox provides OS-level protection — downgrade to warning
        this.logger.log(
          createLogEntry(
            "hooks_protection_sdk_sandbox_fallback",
            "warn",
            `Hooks protection missing but SDK native sandbox active: ${hooksResult.reason ?? "unknown"}`,
            { runId: this.config.runId },
          ),
        );
      } else if (!this.config.forceNoHooks) {
        throw new HooksProtectionMissingError(hooksResult.reason ?? "unknown", this.config.cwd);
      }
      // Explicit bypass: warn + write audit flag
      this.logger.log(
        createLogEntry(
          "hooks_protection_bypassed",
          "warn",
          this.t("driver.warning.hooksProtectionBypassed", {
            reason: hooksResult.reason ?? "unknown",
          }),
          { runId: this.config.runId },
        ),
      );
      this.writeForceNoHooksFlag(hooksResult.reason ?? "unknown");
    }

    // Skill-aware startup: write Loop fields to StatusFile.
    if (this.config.skillAware) {
      try {
        initializeLoopFields(
          this.statusFileIO,
          this.config.runId,
          this.config.presetTier ?? "standard",
        );
      } catch (err) {
        this.logger.log(
          createLogEntry(
            "status_field_init_failed",
            "warn",
            this.t("driver.warning.statusFieldInitFailed", {
              error: err instanceof Error ? err.message : String(err),
            }),
            { runId: this.config.runId },
          ),
        );
      }
    }

    // Sandbox mode: write runtime policy file (legacy shell-hook mode only).
    // SDK native sandbox mode (sdkNativeSandbox) handles isolation via SdkAgentAdapter
    // and does not need .sandbox-active.json.
    if (this.config.sandboxEnabled && !this.config.sdkNativeSandbox) {
      try {
        const sandboxActivePath = path.join(this.config.cwd, ".forge", ".sandbox-active.json");
        const policy = loadSandboxPolicy(this.config.cwd);
        mkdirSync(path.dirname(sandboxActivePath), { recursive: true });
        writeFileSync(sandboxActivePath, JSON.stringify({ projectRoot: this.config.cwd, policy }));
        this.logger.log(
          createLogEntry("sandbox_enabled", "info", "Sandbox mode activated (legacy shell hook)", {
            runId: this.config.runId,
          }),
        );
      } catch (err) {
        this.logger.log(
          createLogEntry(
            "sandbox_init_failed",
            "warn",
            `Sandbox init failed: ${err instanceof Error ? err.message : String(err)}`,
            { runId: this.config.runId },
          ),
        );
      }
    }

    if (this.config.sdkNativeSandbox) {
      this.logger.log(
        createLogEntry("sandbox_enabled", "info", "SDK native sandbox mode activated", {
          runId: this.config.runId,
        }),
      );
    }

    try {
      // Dispatch start event.
      const startResult = transition(
        this.orchestratorState,
        { type: "start", limits: this.config.limits },
        this.config.limits,
      );
      this.orchestratorState = startResult.state;
      this.lastEffects = startResult.effects;
      this.emitEvent("session_started", {
        objective: this.config.objective,
        max_iterations: this.config.limits.maxIterations,
        max_tokens: this.config.limits.maxTokens,
        stop_when: this.config.limits.stopWhen ?? null,
        worktree_mode: !!this.config.runDir,
      });
      await this.executeEffects(startResult.effects);

      // Main loop.
      while (
        this.isLoopActive() &&
        !this.effectExecutor.aborted &&
        !this.effectExecutor.stopped &&
        !this.stopRequested
      ) {
        if (this.hasEffect(this.lastEffects, "schedule_iteration")) {
          await this.executeIteration();
          continue;
        }

        // Backoff: dispatch elapsed event.
        if (this.hasEffect(this.lastEffects, "start_backoff")) {
          const backoffResult = transition(
            this.orchestratorState,
            { type: "backoff_elapsed" },
            this.config.limits,
          );
          this.orchestratorState = backoffResult.state;
          this.lastEffects = backoffResult.effects;
          await this.executeEffects(backoffResult.effects);
          continue;
        }

        // No actionable effects — exit loop.
        break;
      }

      return this.buildResult();
    } finally {
      // Performance baseline.
      const baseline = this.perfTracker.computeBaseline();
      this.logger.log(
        createLogEntry(
          "performance_baseline",
          "info",
          "Run performance summary",
          {
            runId: this.config.runId,
          },
          { ...baseline },
        ),
      );

      // Completion summary (skill-aware only).
      if (this.config.skillAware) {
        try {
          const completionCtx: CompletionContext = {
            status: this.orchestratorState.status,
            currentIteration: this.orchestratorState.currentIteration,
            notesDocument: this.notesDocument,
            objective: this.config.objective,
            branchName: this.config.branchName,
            presetTier: this.config.presetTier ?? "standard",
            loopCompletedNormally: this.loopCompletedNormally,
            reviewFixAttempts: this.reviewFixAttempts,
            maxConsecutiveFailures: this.config.loopConfig.maxConsecutiveFailures,
            readReviewFile: this.config.readReviewFile,
            t: (key: string, params?: Record<string, string>) => this.t(key, params),
          };
          const summary = formatCompletionSummary(completionCtx, baseline);
          this.logger.log(
            createLogEntry("completion_summary", "info", summary, { runId: this.config.runId }),
          );
        } catch (err) {
          this.logger.log(
            createLogEntry(
              "completion_summary_failed",
              "warn",
              "Failed to format completion summary",
              {
                runId: this.config.runId,
              },
              { error: err instanceof Error ? err.message : String(err) },
            ),
          );
        }
      }

      // Skill-aware cleanup: clear Loop fields.
      if (this.config.skillAware) {
        try {
          clearLoopFieldsOnShutdown(this.statusFileIO, this.loopCompletedNormally);
        } catch (err) {
          this.logger.log(
            createLogEntry(
              "status_field_clear_failed",
              "warn",
              "Failed to clear loop status fields",
              {
                runId: this.config.runId,
              },
              { error: err instanceof Error ? err.message : String(err) },
            ),
          );
        }
      }

      // PUA cleanup.
      if (this.config.puaEnabled) {
        try {
          this.puaStateManager?.safeClearFields();
        } catch (err) {
          this.logger.log(
            createLogEntry(
              "pua_field_clear_failed",
              "warn",
              "Failed to clear PUA fields",
              {
                runId: this.config.runId,
              },
              { error: err instanceof Error ? (err.stack ?? err.message) : String(err) },
            ),
          );
        }
      }

      // Sandbox cleanup.
      if (this.config.sandboxEnabled) {
        try {
          const sandboxActivePath = path.join(this.config.cwd, ".forge", ".sandbox-active.json");
          rmSync(sandboxActivePath, { force: true });
        } catch {
          // Non-critical: stale file won't affect future runs if sandbox is not enabled.
        }
      }

      // Abort any in-flight agent invocation.
      if (this.currentAbortController) {
        this.currentAbortController.abort("driver shutdown");
        this.currentAbortController = null;
      }
    }
  }

  /** Signal the driver to stop gracefully. */
  requestStop(): void {
    this.emitEvent("loop_interrupted", { reason: "user_interrupt" });
    this.stopRequested = true;
    if (this.currentAbortController) {
      this.currentAbortController.abort("user interrupt");
    }
    const result = transition(
      this.orchestratorState,
      { type: "user_interrupt" },
      this.config.limits,
    );
    this.orchestratorState = result.state;
    this.lastEffects = result.effects;
    this.stopPromise = this.executeEffects(result.effects);
  }

  /** Returns the cleanup promise from the last requestStop() call. */
  getStopPromise(): Promise<void> | null {
    return this.stopPromise ?? null;
  }

  private isLoopActive(): boolean {
    const { status } = this.orchestratorState;
    return status === "running" || status === "waiting";
  }

  /** Check if a specific effect type exists in an effects array. */
  private hasEffect(effects: OrchestratorEffect[], type: OrchestratorEffect["type"]): boolean {
    return effects.some((e) => e.type === type);
  }

  /** Dispatch iteration to skill-aware or generic path. */
  private async executeIteration(): Promise<void> {
    if (this.config.skillAware) {
      return this.executeSkillAwareIteration();
    }
    return this.executeGenericIteration();
  }

  /** Generic iteration — delegates to extracted function. */
  private async executeGenericIteration(): Promise<void> {
    this.currentAbortController = new AbortController();
    try {
      const ctx = this.buildIterationContext();
      this.emitEvent("iter_started", { iteration: this.orchestratorState.currentIteration });
      const result = await executeGenericIterationFn(ctx);
      this.applyIterationResult(result);
      this.emitIterResultEvent(result);
    } finally {
      this.currentAbortController = null;
    }
  }

  /** Build an IterationContext from current driver state. */
  private buildIterationContext(): IterationContext {
    return {
      config: this.config,
      limits: this.config.limits,
      orchestratorState: this.orchestratorState,
      notesContent: this.notesContent,
      notesDocument: this.notesDocument,
      agentAdapter: this.agentAdapter,
      effectExecutor: this.effectExecutor,
      logger: this.logger,
      perfTracker: this.perfTracker,
      executeEffects: (effects: OrchestratorEffect[]) => this.executeEffects(effects),
      t: (key: string, params?: Record<string, string>) => this.t(key, params),
      abortSignal: this.currentAbortController?.signal,
      puaEnabled: this.config.puaEnabled ?? false,
      puaStateManager: this.puaStateManager,
    };
  }

  /** Apply state mutations from an extracted iteration function. */
  private applyIterationResult(result: IterationResult): void {
    this.orchestratorState = result.orchestratorState;
    this.notesDocument = result.notesDocument;
    this.notesContent = result.notesContent;
    this.lastEffects = result.lastEffects;
    if (result.reviewFixAttempts !== undefined) {
      this.reviewFixAttempts = result.reviewFixAttempts;
    }
    if (result.loopCompletedNormally !== undefined) {
      this.loopCompletedNormally = result.loopCompletedNormally;
    }
  }

  /** Emit commit or rollback event based on iteration result. */
  private emitIterResultEvent(result: IterationResult): void {
    const iter = this.orchestratorState.currentIteration;
    if (result.lastEffects.some((e) => e.type === "commit")) {
      this.emitEvent("iter_committed", { iteration: iter });
    } else if (result.lastEffects.some((e) => e.type === "rollback")) {
      this.emitEvent("iter_rolled_back", { iteration: iter });
    }
  }

  /** Skill-aware iteration — delegates to extracted function. */
  private async executeSkillAwareIteration(): Promise<void> {
    this.currentAbortController = new AbortController();
    try {
      const ctx = this.buildSkillIterationContext();
      this.emitEvent("iter_started", { iteration: this.orchestratorState.currentIteration });
      const result = await executeSkillAwareIterationFn(ctx);
      this.applyIterationResult(result);
      this.emitIterResultEvent(result);
    } finally {
      this.currentAbortController = null;
    }
  }

  /** Build a SkillIterationContext extending the base context. */
  private buildSkillIterationContext(): SkillIterationContext {
    return {
      ...this.buildIterationContext(),
      statusFileIO: this.statusFileIO,
      puaStateManager: this.puaStateManager,
      puaEnabled: this.config.puaEnabled ?? false,
      reviewFixAttempts: this.reviewFixAttempts,
    };
  }

  private async executeEffects(effects: OrchestratorEffect[]): Promise<void> {
    const signal = this.currentAbortController?.signal;
    try {
      await this.effectExecutor.executeEffects(effects, signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitEvent("error", { message });
      this.logger.log(
        createLogEntry(
          "effect_execution_failed",
          "error",
          this.t("driver.loop.effectExecutionFailed", { message }),
          {
            runId: this.config.runId,
          },
        ),
      );
      throw error;
    }
  }

  /** Write an audit flag file when --force-no-hooks is used. */
  private writeForceNoHooksFlag(reason: string): void {
    try {
      const flagPath = path.join(this.config.runDir, "force-no-hooks.flag");
      mkdirSync(path.dirname(flagPath), { recursive: true });
      writeFileSync(
        flagPath,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            reason,
            runId: this.config.runId,
          },
          null,
          2,
        ),
        "utf-8",
      );
    } catch (err) {
      this.logger.log(
        createLogEntry(
          "force_no_hooks_flag_failed",
          "warn",
          `Failed to write force-no-hooks audit flag: ${err instanceof Error ? err.message : String(err)}`,
          { runId: this.config.runId },
        ),
      );
    }
  }

  private buildResult(): SdkDriverResult {
    this.emitEvent("loop_terminated", {
      reason: this.loopCompletedNormally ? "natural" : "interrupted",
      total_iterations: this.orchestratorState.currentIteration,
      total_commits: this.orchestratorState.commitCount,
    });
    return {
      finalState: this.orchestratorState,
      notesDocument: this.notesDocument,
      commitCount: this.orchestratorState.commitCount,
    };
  }
}
