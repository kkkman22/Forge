import type { IterationTiming, PerformanceBaseline } from "./types.js";

export function createIterationTiming(
  iterationStartMs: number,
  agentEndMs: number,
  effectEndMs: number,
): IterationTiming {
  const agentCallDurationMs = agentEndMs - iterationStartMs;
  const effectExecutionDurationMs = effectEndMs - agentEndMs;
  const totalIterationDurationMs = effectEndMs - iterationStartMs;
  return {
    iterationStartMs,
    agentCallDurationMs,
    effectExecutionDurationMs,
    totalIterationDurationMs,
  };
}

export function computePerformanceBaseline(timings: IterationTiming[]): PerformanceBaseline {
  if (timings.length === 0) {
    return {
      totalRunTimeMs: 0,
      iterationCount: 0,
      avgIterationMs: Number.NaN,
      maxIterationMs: Number.NaN,
      minIterationMs: Number.NaN,
      avgAgentCallMs: Number.NaN,
    };
  }

  const durations = timings.map((t) => t.totalIterationDurationMs);
  const agentDurations = timings.map((t) => t.agentCallDurationMs);
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  return {
    totalRunTimeMs:
      timings[timings.length - 1].iterationStartMs +
      timings[timings.length - 1].totalIterationDurationMs -
      timings[0].iterationStartMs,
    iterationCount: timings.length,
    avgIterationMs: sum(durations) / durations.length,
    maxIterationMs: Math.max(...durations),
    minIterationMs: Math.min(...durations),
    avgAgentCallMs: sum(agentDurations) / agentDurations.length,
  };
}
