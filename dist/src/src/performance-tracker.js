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
import { buildSubagentTiming, computeExtendedBaseline, createIterationTiming, createLogEntry, detectDegradation, } from "./logger/index.js";
// ---------------------------------------------------------------------------
// PerformanceTracker
// ---------------------------------------------------------------------------
export class PerformanceTracker {
    logger;
    runId;
    iterationTimings = [];
    subagentTimings = [];
    degradationCount = 0;
    previousPhase;
    constructor(logger, runId) {
        this.logger = logger;
        this.runId = runId;
    }
    /**
     * Record timing for a subagent invocation.
     *
     * @param agentName  Human-readable agent name (e.g. "claude").
     * @param startMs    Timestamp when the agent invocation started.
     * @param endMs      Timestamp when the agent invocation completed.
     * @param iteration  Current iteration number (for log context).
     */
    recordSubagentTiming(agentName, startMs, endMs, iteration) {
        const timing = buildSubagentTiming(agentName, startMs, endMs);
        this.subagentTimings.push(timing);
        this.logger.log(createLogEntry("subagent_timing", "debug", "Subagent completed", { runId: this.runId, iteration }, { ...timing }));
    }
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
    recordIterationTiming(iterStartMs, agentEndMs, effectEndMs, iteration, phase) {
        const timing = createIterationTiming(iterStartMs, agentEndMs, effectEndMs);
        this.iterationTimings.push(timing);
        this.logger.log(createLogEntry("iteration_timing", "debug", "Iteration timing", { runId: this.runId, iteration, phase }, { ...timing, phase }));
        // Phase transition detection (Req 3.4, 5.3).
        if (this.previousPhase !== undefined && phase !== this.previousPhase) {
            this.logger.log(createLogEntry("skill_phase_transition", "info", `Phase transition: ${this.previousPhase} → ${phase}`, { runId: this.runId, iteration }, { fromPhase: this.previousPhase, toPhase: phase }));
        }
        this.previousPhase = phase;
        // Degradation detection (Req 5.1, 5.2).
        const degradation = detectDegradation(timing.totalIterationDurationMs, this.iterationTimings.slice(0, -1));
        if (degradation.isDegraded) {
            this.degradationCount++;
            this.logger.log(createLogEntry("performance_degradation", "warn", `Iteration ${iteration} duration anomaly detected`, { runId: this.runId, iteration }, {
                currentMs: degradation.currentMs,
                rollingAvgMs: degradation.rollingAvgMs,
                deviationFactor: degradation.deviationFactor,
            }));
        }
    }
    /**
     * Compute the extended performance baseline from all accumulated timing data.
     *
     * Called once at the end of a run to produce the summary.
     */
    computeBaseline() {
        return computeExtendedBaseline(this.iterationTimings, this.subagentTimings, this.degradationCount);
    }
}
//# sourceMappingURL=performance-tracker.js.map