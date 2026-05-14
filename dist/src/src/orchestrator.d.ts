/**
 * Orchestrator state machine — core state transitions for the autonomous loop.
 *
 * All functions are pure: they accept state and return new state plus a list
 * of effect descriptions, without performing any side effects.
 *
 * Design reference: gnhf-inspired-enhancements § orchestrator.ts
 * **Validates: Requirements 1.1–1.8, 2.1–2.7, 5.1–5.8**
 */
import type { OrchestratorEffect, OrchestratorEvent, OrchestratorState, RunLimits } from "./loop-types.js";
/**
 * Create the initial orchestrator state.
 *
 * The orchestrator starts in the `idle` status with all counters at zero
 * and no pending backoff.
 */
export declare function createInitialState(): OrchestratorState;
/**
 * Check whether the run should be aborted based on configured limits.
 *
 * @param state  Current orchestrator state.
 * @param limits Run limits to check against.
 * @returns A human-readable reason string if the run should abort, or `null`
 *          if no limit has been reached.
 */
export declare function shouldAbort(state: OrchestratorState, limits: RunLimits): string | null;
/**
 * Format a commit message for a successful iteration.
 *
 * @param iteration The 1-based iteration number.
 * @param summary   A short summary of what the iteration accomplished.
 * @returns A single-line commit message string.
 */
export declare function formatCommitMessage(iteration: number, summary: string): string;
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
export declare function transition(state: OrchestratorState, event: OrchestratorEvent, limits?: RunLimits): {
    state: OrchestratorState;
    effects: OrchestratorEffect[];
};
