/**
 * Orchestrator state machine — core state transitions for the autonomous loop.
 *
 * All functions are pure: they accept state and return new state plus a list
 * of effect descriptions, without performing any side effects.
 *
 * Design reference: gnhf-inspired-enhancements § orchestrator.ts
 * **Validates: Requirements 1.1–1.8, 2.1–2.7, 5.1–5.8**
 */

import {
  applyFailure,
  applySuccess,
  calculateBackoffMs,
  shouldCircuitBreak,
} from "./failure-handler.js";
import type {
  OrchestratorEffect,
  OrchestratorEvent,
  OrchestratorState,
  RunLimits,
  TokenUsage,
} from "./loop-types.js";

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/**
 * Create the initial orchestrator state.
 *
 * The orchestrator starts in the `idle` status with all counters at zero
 * and no pending backoff.
 */
export function createInitialState(): OrchestratorState {
  return {
    status: "idle",
    currentIteration: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    commitCount: 0,
    successCount: 0,
    failCount: 0,
    consecutiveFailures: 0,
    consecutiveErrors: 0,
    waitingUntilMs: null,
  };
}

// ---------------------------------------------------------------------------
// Abort check
// ---------------------------------------------------------------------------

/**
 * Check whether the run should be aborted based on configured limits.
 *
 * @param state  Current orchestrator state.
 * @param limits Run limits to check against.
 * @returns A human-readable reason string if the run should abort, or `null`
 *          if no limit has been reached.
 */
export function shouldAbort(state: OrchestratorState, limits: RunLimits): string | null {
  if (limits.maxIterations !== undefined && state.currentIteration >= limits.maxIterations) {
    return "max iterations reached";
  }

  if (
    limits.maxTokens !== undefined &&
    state.totalInputTokens + state.totalOutputTokens >= limits.maxTokens
  ) {
    return "max tokens reached";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Commit message formatting
// ---------------------------------------------------------------------------

/**
 * Format a commit message for a successful iteration.
 *
 * @param iteration The 1-based iteration number.
 * @param summary   A short summary of what the iteration accomplished.
 * @returns A single-line commit message string.
 */
export function formatCommitMessage(iteration: number, summary: string): string {
  return `forge(loop): iteration ${iteration} — ${summary}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Add token usage from an event to the running totals in state.
 */
function addTokenUsage(state: OrchestratorState, usage: TokenUsage): OrchestratorState {
  return {
    ...state,
    totalInputTokens: state.totalInputTokens + usage.inputTokens,
    totalOutputTokens: state.totalOutputTokens + usage.outputTokens,
  };
}

// ---------------------------------------------------------------------------
// Core transition function
// ---------------------------------------------------------------------------

/**
 * Compute the next orchestrator state and side-effect list for a given event.
 *
 * This is the heart of the state machine. Every call is deterministic and
 * pure — the SKILL layer is responsible for executing the returned effects.
 *
 * When `limits` is provided, the function checks `shouldAbort` after updating
 * state on success and soft-failure events, emitting an `abort` effect instead
 * of `schedule_iteration` when a limit is reached.
 *
 * @param state  Current orchestrator state.
 * @param event  The event that just occurred.
 * @param limits Optional run limits for inline abort checking.
 * @returns An object containing the new state and an ordered list of effects.
 */
export function transition(
  state: OrchestratorState,
  event: OrchestratorEvent,
  limits: RunLimits = {},
): { state: OrchestratorState; effects: OrchestratorEffect[] } {
  // Terminal state guard: aborted/stopped states reject all events (R18.1)
  if (state.status === "aborted" || state.status === "stopped") {
    return { state, effects: [] };
  }

  // Idle state guard: only accept "start" events when idle (R18.2)
  if (state.status === "idle" && event.type !== "start") {
    return { state, effects: [] };
  }

  switch (event.type) {
    // ----- idle → running -----
    case "start": {
      const newState: OrchestratorState = {
        ...state,
        status: "running",
      };
      return {
        state: newState,
        effects: [{ type: "schedule_iteration", iterationNumber: newState.currentIteration + 1 }],
      };
    }

    // ----- running: iteration succeeded -----
    case "iteration_success": {
      const afterTokens = addTokenUsage(state, event.tokenUsage);
      const failureState = applySuccess({
        consecutiveFailures: state.consecutiveFailures,
        consecutiveErrors: state.consecutiveErrors,
      });

      const newState: OrchestratorState = {
        ...afterTokens,
        currentIteration: state.currentIteration + 1,
        successCount: state.successCount + 1,
        commitCount: state.commitCount + 1,
        consecutiveFailures: failureState.consecutiveFailures,
        consecutiveErrors: failureState.consecutiveErrors,
      };

      const commitMessage = formatCommitMessage(newState.currentIteration, event.summary);
      const effects: OrchestratorEffect[] = [{ type: "commit", message: commitMessage }];

      // Check abort conditions after updating state
      const abortReason = shouldAbort(newState, limits);
      if (abortReason) {
        return {
          state: { ...newState, status: "aborted" },
          effects: [...effects, { type: "abort", reason: abortReason }],
        };
      }

      effects.push({
        type: "schedule_iteration",
        iterationNumber: newState.currentIteration + 1,
      });

      return { state: newState, effects };
    }

    // ----- running: soft failure -----
    case "iteration_soft_failure": {
      const afterTokens = addTokenUsage(state, event.tokenUsage);
      const failureState = applyFailure(
        {
          consecutiveFailures: state.consecutiveFailures,
          consecutiveErrors: state.consecutiveErrors,
        },
        "soft",
      );

      const newState: OrchestratorState = {
        ...afterTokens,
        currentIteration: state.currentIteration + 1,
        failCount: state.failCount + 1,
        consecutiveFailures: failureState.consecutiveFailures,
        consecutiveErrors: failureState.consecutiveErrors,
      };

      const effects: OrchestratorEffect[] = [{ type: "rollback" }];

      // Check circuit breaker
      if (shouldCircuitBreak(newState.consecutiveFailures)) {
        return {
          state: { ...newState, status: "aborted" },
          effects: [
            ...effects,
            { type: "abort", reason: `${newState.consecutiveFailures} consecutive failures` },
          ],
        };
      }

      // Check abort conditions
      const abortReason = shouldAbort(newState, limits);
      if (abortReason) {
        return {
          state: { ...newState, status: "aborted" },
          effects: [...effects, { type: "abort", reason: abortReason }],
        };
      }

      effects.push({
        type: "schedule_iteration",
        iterationNumber: newState.currentIteration + 1,
      });

      return { state: newState, effects };
    }

    // ----- running: hard failure -----
    case "iteration_hard_failure": {
      const afterTokens = addTokenUsage(state, event.tokenUsage);
      const failureState = applyFailure(
        {
          consecutiveFailures: state.consecutiveFailures,
          consecutiveErrors: state.consecutiveErrors,
        },
        "hard",
      );

      const newState: OrchestratorState = {
        ...afterTokens,
        currentIteration: state.currentIteration + 1,
        failCount: state.failCount + 1,
        consecutiveFailures: failureState.consecutiveFailures,
        consecutiveErrors: failureState.consecutiveErrors,
      };

      const effects: OrchestratorEffect[] = [{ type: "rollback" }];

      // Check circuit breaker — if triggered, abort instead of backoff
      if (shouldCircuitBreak(newState.consecutiveFailures)) {
        return {
          state: { ...newState, status: "aborted" },
          effects: [
            ...effects,
            { type: "abort", reason: `${newState.consecutiveFailures} consecutive failures` },
          ],
        };
      }

      // Otherwise enter waiting state with backoff
      const backoffMs = calculateBackoffMs(newState.consecutiveErrors);
      return {
        state: { ...newState, status: "waiting" },
        effects: [...effects, { type: "start_backoff", durationMs: backoffMs }],
      };
    }

    // ----- running: stop condition met -----
    case "stop_condition_met": {
      return {
        state: { ...state, currentIteration: state.currentIteration + 1, status: "aborted" },
        effects: [{ type: "abort", reason: "stop condition met" }],
      };
    }

    // ----- running or waiting: user interrupt -----
    case "user_interrupt": {
      return {
        state: { ...state, status: "stopped" },
        effects: [{ type: "rollback" }, { type: "stop" }],
      };
    }

    // ----- waiting: backoff elapsed -----
    case "backoff_elapsed": {
      const newState: OrchestratorState = {
        ...state,
        status: "running",
        waitingUntilMs: null,
      };
      return {
        state: newState,
        effects: [{ type: "schedule_iteration", iterationNumber: newState.currentIteration + 1 }],
      };
    }

    default: {
      // Exhaustive check — TypeScript will error here if a new event type
      // is added to OrchestratorEvent but not handled above.
      const _exhaustive: never = event;
      throw new Error(
        `Unhandled orchestrator event type: ${(_exhaustive as OrchestratorEvent).type}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Failure-sink driver helper
// ---------------------------------------------------------------------------

import type { FailureContext } from "./failure-sink.js";

export interface LoopCircuitBrokenInput {
  topic: string;
  tier: "light" | "standard" | "full";
  consecutiveFailures: number;
  failureCategory?: string;
  runId?: string;
}

export function buildLoopCircuitBrokenContext(input: LoopCircuitBrokenInput): FailureContext {
  const category = input.failureCategory ?? "连续错误超限";
  return {
    skill: "forge-loop",
    topic: input.topic,
    tier: input.tier,
    trigger: "loop_circuit_broken",
    situation: [
      `熔断器触发：${input.consecutiveFailures} 次连续失败`,
      input.runId ? `(run: ${input.runId})` : undefined,
      `归类：${category}`,
    ]
      .filter(Boolean)
      .join(" "),
    rootCause: `${input.consecutiveFailures} 次连续失败，${category}`,
  };
}
