/**
 * Performance tracker — encapsulates iteration timing, subagent timing,
 * degradation detection, and phase transition logging.
 *
 * Extracted from SdkDriver to reduce its responsibility surface.
 * All timing data is accumulated here and exposed via `computeBaseline()`
 * for the completion summary.
 *
 * **Validates: Requirements 3.1, 3.3, 3.4, 4.1–4.4, 5.1–5.4, 6.1, 6.2, 6.4, 6.7**
 */
import { createLogEntry, type PerformanceBaseline } from "./logger/index.js";
/** Minimal logger interface — avoids coupling to the concrete LogSink type. */
export interface PerformanceLogger {
    log(entry: ReturnType<typeof createLogEntry>): void;
}
export declare class PerformanceTracker {
    private readonly logger;
    private readonly runId;
    private readonly iterationTimings;
    private readonly subagentTimings;
    private degradationCount;
    private previousPhase;
    constructor(logger: PerformanceLogger, runId: string);
    /**
     * Record timing for a subagent invocation.
     *
     * @param agentName  Human-readable agent name (e.g. "claude").
     * @param startMs    Timestamp when the agent invocation started.
     * @param endMs      Timestamp when the agent invocation completed.
     * @param iteration  Current iteration number (for log context).
     */
    recordSubagentTiming(agentName: string, startMs: number, endMs: number, iteration: number): void;
    /**
     * Record timing for a complete iteration (agent call + effect execution).
     *
     * Also detects phase transitions and performance degradation.
     *
     * @param iterStartMs  Timestamp when the iteration started.
     * @param agentEndMs   Timestamp when the agent call completed.
     * @param effectEndMs  Timestamp when effect execution completed.
     * @param iteration    Current iteration number.
     * @param phase        The SKILL phase for this iteration.
     */
    recordIterationTiming(iterStartMs: number, agentEndMs: number, effectEndMs: number, iteration: number, phase: string): void;
    /**
     * Compute the extended performance baseline from all accumulated timing data.
     *
     * Called once at the end of a run to produce the summary.
     */
    computeBaseline(): PerformanceBaseline;
}
