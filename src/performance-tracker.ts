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

import {
  buildSubagentTiming,
  computeExtendedBaseline,
  createIterationTiming,
  createLogEntry,
  detectDegradation,
  type IterationTiming,
  type PerformanceBaseline,
  type SubagentTiming,
} from "./logger/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal logger interface — avoids coupling to the concrete LogSink type. */
export interface PerformanceLogger {
  log(entry: ReturnType<typeof createLogEntry>): void;
}

// ---------------------------------------------------------------------------
// PerformanceTracker
// ---------------------------------------------------------------------------

export class PerformanceTracker {
  private readonly iterationTimings: IterationTiming[] = [];
  private readonly subagentTimings: SubagentTiming[] = [];
  private degradationCount = 0;
  private previousPhase: string | undefined;

  constructor(
    private readonly logger: PerformanceLogger,
    private readonly runId: string,
  ) {}

  /**
   * Record timing for a subagent invocation.
   *
   * @param agentName  Human-readable agent name (e.g. "claude").
   * @param startMs    Timestamp when the agent invocation started.
   * @param endMs      Timestamp when the agent invocation completed.
   * @param iteration  Current iteration number (for log context).
   */
  recordSubagentTiming(agentName: string, startMs: number, endMs: number, iteration: number): void {
    const timing = buildSubagentTiming(agentName, startMs, endMs);
    this.subagentTimings.push(timing);
    this.logger.log(
      createLogEntry(
        "subagent_timing",
        "debug",
        "Subagent completed",
        { runId: this.runId, iteration },
        { ...timing },
      ),
    );
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
  recordIterationTiming(
    iterStartMs: number,
    agentEndMs: number,
    effectEndMs: number,
    iteration: number,
    phase: string,
  ): void {
    const timing = createIterationTiming(iterStartMs, agentEndMs, effectEndMs);
    this.iterationTimings.push(timing);

    this.logger.log(
      createLogEntry(
        "iteration_timing",
        "debug",
        "Iteration timing",
        { runId: this.runId, iteration, phase },
        { ...timing, phase },
      ),
    );

    // Phase transition detection (Req 3.4, 5.3).
    if (this.previousPhase !== undefined && phase !== this.previousPhase) {
      this.logger.log(
        createLogEntry(
          "skill_phase_transition",
          "info",
          `Phase transition: ${this.previousPhase} → ${phase}`,
          { runId: this.runId, iteration },
          { fromPhase: this.previousPhase, toPhase: phase },
        ),
      );
    }
    this.previousPhase = phase;

    // Degradation detection (Req 5.1, 5.2).
    const degradation = detectDegradation(
      timing.totalIterationDurationMs,
      this.iterationTimings.slice(0, -1), // exclude current iteration
    );
    if (degradation.isDegraded) {
      this.degradationCount++;
      this.logger.log(
        createLogEntry(
          "performance_degradation",
          "warn",
          `Iteration ${iteration} duration anomaly detected`,
          { runId: this.runId, iteration },
          {
            currentMs: degradation.currentMs,
            rollingAvgMs: degradation.rollingAvgMs,
            deviationFactor: degradation.deviationFactor,
          },
        ),
      );
    }
  }

  /**
   * Compute the extended performance baseline from all accumulated timing data.
   *
   * Called once at the end of a run to produce the summary.
   */
  computeBaseline(): PerformanceBaseline {
    return computeExtendedBaseline(
      this.iterationTimings,
      this.subagentTimings,
      this.degradationCount,
    );
  }
}
