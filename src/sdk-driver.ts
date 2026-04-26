/**
 * SDK Driver — the core autonomous loop driver that bridges the pure-function
 * state machine with real I/O via the Agent SDK and effect executor.
 *
 * The driver owns the `while` loop, orchestrator state, and notes document.
 * It delegates all I/O to the effect executor and agent adapter, keeping
 * itself focused on event dispatch and loop control.
 *
 * Design reference: sdk-autonomous-loop § sdk-driver.ts
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 2.1–2.7, 3.1–3.7,
 *   4.1–4.6, 5.1–5.4, 8.1–8.4, 9.1–9.3, 10.1–10.5**
 */

import { appendEntry, buildIterationPrompt, formatNotesDocument } from "./context-accumulator.js";
import type { EffectExecutor } from "./effect-executor.js";
import type {
  AgentInterface,
  AgentOutput,
  IterationEntry,
  LoopConfig,
  NotesDocument,
  OrchestratorEffect,
  OrchestratorEvent,
  OrchestratorState,
  RunLimits,
  TokenUsage,
} from "./loop-types.js";
import { createInitialState, transition } from "./orchestrator.js";
import { RunManager } from "./run-manager.js";

// ---------------------------------------------------------------------------
// Configuration and result types
// ---------------------------------------------------------------------------

/**
 * Configuration for the SDK driver instance.
 *
 * The `warmQuery` field is typed as `unknown` to avoid importing Agent SDK
 * types directly — the driver never touches it; it's passed through to the
 * agent adapter.
 */
export interface SdkDriverConfig {
  /** The user-provided objective for the autonomous loop. */
  objective: string;
  /** Loop configuration (agent, failure thresholds, etc.). */
  loopConfig: LoopConfig;
  /** User-specified resource limits. */
  limits: RunLimits;
  /** Working directory (repository root). */
  cwd: string;
  /** Unique identifier for this run. */
  runId: string;
  /** Path to the run directory. */
  runDir: string;
  /** Pre-warmed Agent SDK query handle. */
  warmQuery: unknown;
  /** Base commit SHA for branch commit counting. */
  baseCommit: string;
  /** Path to the notes.md file for persistence. */
  notesPath: string;
}

/** Result returned when the driver loop exits. */
export interface SdkDriverResult {
  /** The final orchestrator state at loop exit. */
  finalState: OrchestratorState;
  /** The accumulated notes document. */
  notesDocument: NotesDocument;
  /** Number of successful commits made during the run. */
  commitCount: number;
}

// ---------------------------------------------------------------------------
// SdkDriver class
// ---------------------------------------------------------------------------

/**
 * Core autonomous loop driver.
 *
 * Bridges the pure-function state machine (`orchestrator.ts`) with real I/O
 * via the effect executor and agent adapter. Owns the main `while` loop,
 * orchestrator state, and notes document.
 */
export class SdkDriver {
  private readonly config: SdkDriverConfig;
  private readonly effectExecutor: EffectExecutor;
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

  constructor(
    config: SdkDriverConfig,
    effectExecutor: EffectExecutor,
    agentAdapter: AgentInterface,
  ) {
    // Validate objective is non-empty after trimming.
    if (!config.objective.trim()) {
      throw new Error("Objective must be a non-empty string");
    }

    this.config = config;
    this.effectExecutor = effectExecutor;
    this.agentAdapter = agentAdapter;

    // Initialize orchestrator state.
    this.orchestratorState = createInitialState();

    // Initialize empty notes document.
    this.notesDocument = { runId: config.runId, entries: [] };
    this.notesContent = formatNotesDocument(this.notesDocument);
  }

  /**
   * Run the autonomous loop until a termination condition is met.
   *
   * The loop continues while the orchestrator state is `running` or `waiting`.
   * It exits when the state transitions to `aborted` or `stopped`, or when
   * the effect executor sets its `aborted` or `stopped` flags.
   *
   * @returns The final driver result with state, notes, and commit count.
   */
  async run(): Promise<SdkDriverResult> {
    try {
      // Dispatch the start event to kick off the state machine.
      const startResult = transition(
        this.orchestratorState,
        { type: "start", limits: this.config.limits },
        this.config.limits,
      );
      this.orchestratorState = startResult.state;
      this.lastEffects = startResult.effects;
      await this.executeEffects(startResult.effects);

      // Main loop: continue while running or waiting.
      while (
        this.isLoopActive() &&
        !this.effectExecutor.aborted &&
        !this.effectExecutor.stopped &&
        !this.stopRequested
      ) {
        // Check for schedule_iteration effect.
        if (this.hasEffect(this.lastEffects, "schedule_iteration")) {
          await this.executeIteration();
          continue;
        }

        // Check for start_backoff effect — it was already executed by
        // executeEffects; now dispatch the elapsed event.
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

        // No actionable effects remain — break to avoid infinite loop.
        break;
      }

      return this.buildResult();
    } finally {
      // Cleanup: abort any in-flight agent invocation.
      if (this.currentAbortController) {
        this.currentAbortController.abort("driver shutdown");
        this.currentAbortController = null;
      }
    }
  }

  /**
   * Signal the driver to stop gracefully.
   *
   * Dispatches a `user_interrupt` event to the state machine, executes
   * the resulting effects, and aborts the current agent invocation.
   */
  requestStop(): void {
    this.stopRequested = true;

    // Abort the current agent invocation if one is in progress.
    if (this.currentAbortController) {
      this.currentAbortController.abort("user interrupt");
    }

    // Dispatch user_interrupt event to the state machine.
    const result = transition(
      this.orchestratorState,
      { type: "user_interrupt" },
      this.config.limits,
    );
    this.orchestratorState = result.state;
    this.lastEffects = result.effects;

    // Execute effects (rollback + stop) — fire and forget since
    // requestStop is called from signal handlers.
    void this.executeEffects(result.effects);
  }

  // -------------------------------------------------------------------------
  // Private: loop helpers
  // -------------------------------------------------------------------------

  /** Check if the loop should continue running. */
  private isLoopActive(): boolean {
    const { status } = this.orchestratorState;
    return status === "running" || status === "waiting";
  }

  /** Check if a specific effect type exists in an effects array. */
  private hasEffect(effects: OrchestratorEffect[], type: OrchestratorEffect["type"]): boolean {
    return effects.some((e) => e.type === type);
  }

  // -------------------------------------------------------------------------
  // Private: iteration execution
  // -------------------------------------------------------------------------

  /**
   * Execute a single iteration: build prompt → invoke agent → process result.
   */
  private async executeIteration(): Promise<void> {
    const iterationNumber = this.orchestratorState.currentIteration + 1;

    // Build the iteration prompt with current notes content.
    const prompt = buildIterationPrompt({
      iteration: iterationNumber,
      runId: this.config.runId,
      objective: this.config.objective,
      notesContent: this.notesContent,
      stopWhen: this.config.limits.stopWhen,
    });

    // Create a fresh AbortController for this iteration.
    this.currentAbortController = new AbortController();

    let event: OrchestratorEvent;
    let iterationEntry: IterationEntry;

    try {
      // Invoke the agent adapter.
      const agentResult = await this.agentAdapter.run(prompt, this.config.cwd, {
        signal: this.currentAbortController.signal,
      });

      const output: AgentOutput = agentResult.output;
      const usage: TokenUsage = agentResult.usage;

      if (output.should_fully_stop) {
        // Stop condition met — dispatch stop_condition_met event.
        const stopResult = transition(
          this.orchestratorState,
          { type: "stop_condition_met" },
          this.config.limits,
        );
        this.orchestratorState = stopResult.state;
        this.lastEffects = stopResult.effects;
        await this.executeEffects(stopResult.effects);

        // Still record the iteration entry.
        iterationEntry = this.buildIterationEntry(iterationNumber, true, output);
        this.appendAndPersistNotes(iterationEntry, usage);
        return;
      }

      if (output.success) {
        // Successful iteration.
        event = {
          type: "iteration_success",
          summary: output.summary,
          tokenUsage: usage,
        };
        iterationEntry = this.buildIterationEntry(iterationNumber, true, output);
      } else {
        // Soft failure — agent reported success: false.
        event = {
          type: "iteration_soft_failure",
          summary: output.summary,
          tokenUsage: usage,
        };
        iterationEntry = this.buildIterationEntry(iterationNumber, false, output);
      }
    } catch (error) {
      // Hard failure — SDK error or validation error.
      const errorMessage = error instanceof Error ? error.message : String(error);
      const zeroUsage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      };

      event = {
        type: "iteration_hard_failure",
        error: errorMessage,
        tokenUsage: zeroUsage,
      };

      iterationEntry = {
        number: iterationNumber,
        success: false,
        summary: errorMessage,
        keyChanges: [],
        keyLearnings: [],
      };
    } finally {
      this.currentAbortController = null;
    }

    // Dispatch the event to the state machine.
    const result = transition(this.orchestratorState, event, this.config.limits);
    this.orchestratorState = result.state;
    this.lastEffects = result.effects;

    // Execute the resulting effects (commit/rollback, schedule_iteration, etc.).
    await this.executeEffects(result.effects);

    // Append iteration entry to notes and persist.
    this.appendAndPersistNotes(
      iterationEntry,
      "tokenUsage" in event ? event.tokenUsage : undefined,
    );
  }

  // -------------------------------------------------------------------------
  // Private: notes management
  // -------------------------------------------------------------------------

  /** Build an `IterationEntry` from an iteration result. */
  private buildIterationEntry(
    number: number,
    success: boolean,
    output: AgentOutput,
  ): IterationEntry {
    return {
      number,
      success,
      summary: output.summary,
      keyChanges: success ? output.key_changes_made : [],
      keyLearnings: output.key_learnings,
    };
  }

  /** Append an iteration entry to the notes document and persist to disk. */
  private appendAndPersistNotes(entry: IterationEntry, usage?: TokenUsage): void {
    // Append entry to the notes document.
    this.notesDocument.entries.push(entry);
    this.notesContent = appendEntry(this.notesContent, entry);

    // Persist notes to disk.
    RunManager.persistNotes(this.config.notesPath, this.notesContent);

    // Log token usage if available.
    if (usage) {
      this.logTokenUsage(usage);
    }
  }

  /** Log cumulative token usage after an iteration. */
  private logTokenUsage(usage: TokenUsage): void {
    const state = this.orchestratorState;
    const message =
      `Iteration tokens — input: ${usage.inputTokens}, output: ${usage.outputTokens}, ` +
      `cache read: ${usage.cacheReadTokens}, cache creation: ${usage.cacheCreationTokens} | ` +
      `Cumulative — input: ${state.totalInputTokens}, output: ${state.totalOutputTokens}`;
    console.log(message);
  }

  // -------------------------------------------------------------------------
  // Private: effect execution
  // -------------------------------------------------------------------------

  /** Execute an array of effects via the effect executor. */
  private async executeEffects(effects: OrchestratorEffect[]): Promise<void> {
    const signal = this.currentAbortController?.signal;
    await this.effectExecutor.executeEffects(effects, signal);
  }

  // -------------------------------------------------------------------------
  // Private: result construction
  // -------------------------------------------------------------------------

  /** Build the final driver result. */
  private buildResult(): SdkDriverResult {
    return {
      finalState: this.orchestratorState,
      notesDocument: this.notesDocument,
      commitCount: this.orchestratorState.commitCount,
    };
  }
}
