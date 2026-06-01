/**
 *
 * Evaluates structured stop conditions against current loop state.
 * Supports: max-iterations, phase-reached, commit-count.
 *
 */
/** Minimal loop state slice for stopWhen evaluation. */
export interface StopWhenState {
    totalIterations: number;
    consecutiveFailures: number;
    lastSuccessCommit: string;
    phase: string;
    haltReason: string;
}
/** Parsed stop condition. */
export interface ParsedCondition {
    type: "max-iterations" | "phase-reached" | "commit-count";
    value: number | string;
}
/** Result of stopWhen evaluation. */
export interface StopWhenResult {
    shouldStop: boolean;
    reason: string;
}
/**
 * Parse a structured stop condition string.
 *
 * Supported formats:
 * - `max-iterations:N` — stop after N total iterations
 * - `phase-reached:<phase>` — stop when entering the named phase
 * - `commit-count:N` — stop after at least N success commits
 */
export declare function parseStopCondition(condition: string): ParsedCondition | null;
/**
 * Evaluate a stop condition against current loop state.
 */
export declare function evaluateStopWhen(condition: string, state: StopWhenState): StopWhenResult;
