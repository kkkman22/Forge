/**
 * SDK Generic Iteration — extracted non-skill-aware iteration logic from SdkDriver.
 *
 * Contains the `executeGenericIteration` standalone async function that was
 * previously the `SdkDriver.executeGenericIteration()` private method (~210 lines).
 *
 * The function accepts an `IterationContext` parameter (bundling all dependencies)
 * and returns a `Promise<IterationResult>` describing the state mutations the
 * caller should apply.
 *
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 3.1, 3.2, 10.5**
 */

import { buildIterationPrompt, compactNotesContent } from "./context-accumulator.js";
import { isContextOverflowError } from "./context-overflow.js";
import { FrozenZoneViolation } from "./effect-executor.js";
import { buildEntry } from "./event-log.js";
import { createLogEntry } from "./logger/index.js";
import type { AgentOutput, IterationEntry, OrchestratorEvent, TokenUsage } from "./loop-types.js";
import { transition } from "./orchestrator.js";
import type { IterationContext, IterationResult } from "./sdk-driver-types.js";
import { appendAndPersistNotes, buildIterationEntry } from "./sdk-notes-manager.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZERO_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNoOpIteration(output: AgentOutput): boolean {
  return Array.isArray(output.key_changes_made) && output.key_changes_made.length === 0;
}

// ---------------------------------------------------------------------------
// executeGenericIteration
// ---------------------------------------------------------------------------

/**
 * Execute a single generic (non-skill-aware) iteration of the autonomous loop.
 *
 * This function encapsulates the full lifecycle of one iteration:
 * 1. Build the iteration prompt from current notes content
 * 2. Invoke the agent adapter
 * 3. Dispatch the resulting event to the orchestrator state machine
 * 4. Execute the resulting effects (commit/rollback, schedule_iteration, etc.)
 * 5. Append the iteration entry to notes and persist
 * 6. Record performance timing
 *
 * All state mutations are tracked locally and returned in the `IterationResult`.
 * The caller (`SdkDriver`) applies them to its private fields.
 *
 * @param ctx - The iteration context bundling all dependencies.
 * @returns The iteration result describing state mutations.
 */
export async function executeGenericIteration(ctx: IterationContext): Promise<IterationResult> {
  // Snapshot mutable state locally so we can track mutations.
  let orchestratorState = ctx.orchestratorState;
  let notesDocument = ctx.notesDocument;
  let notesContent = ctx.notesContent;

  const iterationNumber = orchestratorState.currentIteration + 1;
  const iterStartMs = Date.now();

  // Build the iteration prompt with current notes content.
  const prompt = buildIterationPrompt({
    iteration: iterationNumber,
    runId: ctx.config.runId,
    objective: ctx.config.objective,
    notesContent,
    stopWhen: ctx.limits.stopWhen,
  });

  // Create a fresh AbortController for this iteration, or use the signal
  // provided by the caller (SdkDriver passes its currentAbortController's
  // signal so that requestStop() can abort in-flight agent calls).
  const abortController = new AbortController();
  const signal = ctx.abortSignal ?? abortController.signal;

  let event: OrchestratorEvent;
  let iterationEntry: IterationEntry;
  let agentEndMs = iterStartMs;

  try {
    // Invoke the agent adapter with subagent timing.
    const subagentStartMs = Date.now();
    const agentResult = await ctx.agentAdapter.run(prompt, ctx.config.cwd, {
      signal,
    });
    agentEndMs = Date.now();

    // Record subagent timing.
    ctx.perfTracker.recordSubagentTiming(
      ctx.agentAdapter.name,
      subagentStartMs,
      agentEndMs,
      iterationNumber,
    );

    const output: AgentOutput = agentResult.output;
    const usage: TokenUsage = agentResult.usage;

    // DEBUG: log structured output to diagnose success=false issue
    ctx.logger.log(
      createLogEntry(
        "debug_output",
        "info",
        `Structured output: success=${output.success}, summary="${output.summary?.slice(0, 100)}", changes=${JSON.stringify(output.key_changes_made)?.slice(0, 200)}`,
        { runId: ctx.config.runId, iteration: iterationNumber },
      ),
    );

    // Auto-stop: if the iteration succeeded but made no changes, the task
    // is complete — stop the loop rather than keep verifying indefinitely.
    if (output.should_fully_stop || (output.success && isNoOpIteration(output))) {
      // Stop condition met — dispatch stop_condition_met event.
      const stopResult = transition(orchestratorState, { type: "stop_condition_met" }, ctx.limits);
      orchestratorState = stopResult.state;
      const lastEffects = stopResult.effects;
      await ctx.executeEffects(stopResult.effects);

      // Still record the iteration entry.
      iterationEntry = buildIterationEntry(iterationNumber, true, output);
      ({ notesDocument, notesContent } = appendAndPersistNotes(
        notesDocument,
        notesContent,
        iterationEntry,
        ctx.config.notesPath,
        usage,
        ctx.logger,
        orchestratorState,
        (key, params) => ctx.t(key, params),
        ctx.config.runId,
      ));

      return { orchestratorState, notesDocument, notesContent, lastEffects };
    }

    if (output.success) {
      // Successful iteration.
      event = {
        type: "iteration_success",
        summary: output.summary,
        tokenUsage: usage,
      };
      iterationEntry = buildIterationEntry(iterationNumber, true, output);
    } else {
      // Soft failure — agent reported success: false.
      event = {
        type: "iteration_soft_failure",
        summary: output.summary,
        tokenUsage: usage,
      };
      iterationEntry = buildIterationEntry(iterationNumber, false, output);
    }
  } catch (error) {
    // Hard failure — SDK error or validation error.
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Context overflow recovery: compact notes and retry once.
    if (isContextOverflowError(error)) {
      ctx.logger.log(
        createLogEntry(
          "compact_notes_triggered",
          "info",
          `Context overflow detected — compacting notes and retrying`,
          { runId: ctx.config.runId, iteration: iterationNumber },
        ),
      );

      const compactedNotes = compactNotesContent(notesContent);
      const retryPrompt = buildIterationPrompt({
        iteration: iterationNumber,
        runId: ctx.config.runId,
        objective: ctx.config.objective,
        notesContent: compactedNotes,
        stopWhen: ctx.limits.stopWhen,
      });

      try {
        const subagentStartMs = Date.now();
        const retryResult = await ctx.agentAdapter.run(retryPrompt, ctx.config.cwd, { signal });
        agentEndMs = Date.now();

        ctx.perfTracker.recordSubagentTiming(
          ctx.agentAdapter.name,
          subagentStartMs,
          agentEndMs,
          iterationNumber,
        );

        const output: AgentOutput = retryResult.output;
        const usage: TokenUsage = retryResult.usage;

        ctx.logger.log(
          createLogEntry(
            "debug_output",
            "info",
            `Retry after compaction: success=${output.success}, summary="${output.summary?.slice(0, 100)}"`,
            { runId: ctx.config.runId, iteration: iterationNumber },
          ),
        );

        // Use compacted notes going forward.
        notesContent = compactedNotes;

        if (output.should_fully_stop || (output.success && isNoOpIteration(output))) {
          const stopResult = transition(
            orchestratorState,
            { type: "stop_condition_met" },
            ctx.limits,
          );
          orchestratorState = stopResult.state;
          const lastEffects = stopResult.effects;
          await ctx.executeEffects(stopResult.effects);

          iterationEntry = buildIterationEntry(iterationNumber, true, output);
          ({ notesDocument, notesContent } = appendAndPersistNotes(
            notesDocument,
            notesContent,
            iterationEntry,
            ctx.config.notesPath,
            usage,
            ctx.logger,
            orchestratorState,
            (key, params) => ctx.t(key, params),
            ctx.config.runId,
          ));

          return { orchestratorState, notesDocument, notesContent, lastEffects };
        }

        if (output.success) {
          event = { type: "iteration_success", summary: output.summary, tokenUsage: usage };
          iterationEntry = buildIterationEntry(iterationNumber, true, output);
        } else {
          event = { type: "iteration_soft_failure", summary: output.summary, tokenUsage: usage };
          iterationEntry = buildIterationEntry(iterationNumber, false, output);
        }

        // Retry succeeded — dispatch event and execute effects inline,
        // then return early to skip the hard-failure path below.
        const retryResult_dispatch = transition(orchestratorState, event, ctx.limits);
        const retryPreState = orchestratorState;
        orchestratorState = retryResult_dispatch.state;
        let lastEffects = retryResult_dispatch.effects;

        const retryLogEntry = buildEntry(
          ctx.config.runId,
          retryPreState.currentIteration,
          event,
          retryPreState,
          retryResult_dispatch.state,
          retryResult_dispatch.effects,
        );
        lastEffects = [...lastEffects, { type: "write_event_log", entry: retryLogEntry }];

        await ctx.executeEffects(lastEffects);

        ({ notesDocument, notesContent } = appendAndPersistNotes(
          notesDocument,
          notesContent,
          iterationEntry,
          ctx.config.notesPath,
          usage,
          ctx.logger,
          orchestratorState,
          (key, params) => ctx.t(key, params),
          ctx.config.runId,
        ));

        const retryEffectEndMs = Date.now();
        ctx.perfTracker.recordIterationTiming(
          iterStartMs,
          agentEndMs,
          retryEffectEndMs,
          iterationNumber,
          "generic",
        );

        return { orchestratorState, notesDocument, notesContent, lastEffects };
      } catch (retryError) {
        // Retry also failed — fall through to normal hard failure handling.
        const retryErrorMsg = retryError instanceof Error ? retryError.message : String(retryError);
        ctx.logger.log(
          createLogEntry(
            "compact_notes_retry_failed",
            "warn",
            `Retry after compaction also failed: ${retryErrorMsg}`,
            { runId: ctx.config.runId, iteration: iterationNumber },
          ),
        );
      }
    }

    const zeroUsage: TokenUsage = ZERO_TOKEN_USAGE;

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

    // PUA: escalate pressure on hard failure (Req 17.1)
    if (ctx.puaEnabled) {
      ctx.puaStateManager?.handleFailure(errorMessage, orchestratorState.consecutiveFailures);
    }
  }

  // Dispatch the event to the state machine.
  const result = transition(orchestratorState, event, ctx.limits);

  // Save pre-transition state in case effect execution fails.
  // If effects fail (e.g., commit throws), we revert to the pre-transition
  // state and dispatch iteration_hard_failure instead, ensuring commitCount
  // is NOT incremented for failed commits.
  const preTransitionState = orchestratorState;

  orchestratorState = result.state;
  let lastEffects = result.effects;

  // Append a write_event_log effect so the full event stream is persisted
  // to .forge/runs/<runId>/events.jsonl for audit and replay
  // (Requirement 3.1, 3.5).
  const logEntry = buildEntry(
    ctx.config.runId,
    preTransitionState.currentIteration,
    event,
    preTransitionState,
    result.state,
    result.effects,
  );
  lastEffects = [...lastEffects, { type: "write_event_log", entry: logEntry }];

  // Execute the resulting effects (commit/rollback, schedule_iteration,
  // write_event_log, etc.).
  try {
    await ctx.executeEffects(lastEffects);
  } catch (effectError) {
    const effectMessage = effectError instanceof Error ? effectError.message : String(effectError);

    // FrozenZoneViolation: terminate loop directly without backoff.
    if (effectError instanceof FrozenZoneViolation) {
      const abortResult = transition(orchestratorState, { type: "stop_condition_met" }, ctx.limits);
      orchestratorState = abortResult.state;
      lastEffects = abortResult.effects;
      await ctx.executeEffects(abortResult.effects);

      iterationEntry = {
        number: iterationEntry.number,
        success: false,
        summary: `Frozen zone violation — loop terminated: ${effectMessage}`,
        keyChanges: [],
        keyLearnings: [],
      };

      ({ notesDocument, notesContent } = appendAndPersistNotes(
        notesDocument,
        notesContent,
        iterationEntry,
        ctx.config.notesPath,
      ));

      return { orchestratorState, notesDocument, notesContent, lastEffects };
    }

    // UnexpectedEffectError or any other error: trigger iteration_hard_failure + backoff.
    // Revert to pre-transition state so that commitCount is not incremented.
    orchestratorState = preTransitionState;

    // PUA: treat effect failure as a failure path (Req 17.1)
    if (ctx.puaEnabled) {
      ctx.puaStateManager?.handleFailure(
        `Effect execution failed: ${effectMessage}`,
        orchestratorState.consecutiveFailures,
      );
    }

    // Dispatch iteration_hard_failure from the original state — this triggers
    // rollback and does NOT increment commitCount.
    const zeroUsage: TokenUsage = ZERO_TOKEN_USAGE;
    const failureResult = transition(
      orchestratorState,
      { type: "iteration_hard_failure", error: effectMessage, tokenUsage: zeroUsage },
      ctx.limits,
    );
    orchestratorState = failureResult.state;
    lastEffects = failureResult.effects;

    // Execute the failure effects (rollback + backoff).
    await ctx.executeEffects(failureResult.effects);

    // Record the effect failure in the iteration's notes entry.
    iterationEntry = {
      number: iterationEntry.number,
      success: false,
      summary: `Effect execution failed: ${effectMessage}`,
      keyChanges: [],
      keyLearnings: [],
    };

    ({ notesDocument, notesContent } = appendAndPersistNotes(
      notesDocument,
      notesContent,
      iterationEntry,
      ctx.config.notesPath,
    ));

    return { orchestratorState, notesDocument, notesContent, lastEffects };
  }

  // Append iteration entry to notes and persist.
  ({ notesDocument, notesContent } = appendAndPersistNotes(
    notesDocument,
    notesContent,
    iterationEntry,
    ctx.config.notesPath,
    "tokenUsage" in event ? event.tokenUsage : undefined,
    ctx.logger,
    orchestratorState,
    (key, params) => ctx.t(key, params),
    ctx.config.runId,
  ));

  // Record iteration timing.
  const effectEndMs = Date.now();
  ctx.perfTracker.recordIterationTiming(
    iterStartMs,
    agentEndMs,
    effectEndMs,
    iterationNumber,
    "generic",
  );

  return { orchestratorState, notesDocument, notesContent, lastEffects };
}
