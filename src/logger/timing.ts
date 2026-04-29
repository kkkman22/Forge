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
    maxIterationMs: durations.reduce((a, b) => Math.max(a, b), -Infinity),
    minIterationMs: durations.reduce((a, b) => Math.min(a, b), Infinity),
    avgAgentCallMs: sum(agentDurations) / agentDurations.length,
  };
}

function formatDuration(ms: number): string {
  if (Number.isNaN(ms)) return "N/A";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatPerformanceBaseline(baseline: PerformanceBaseline): string {
  if (baseline.iterationCount === 0) {
    return "=== Performance Baseline ===\nNo iterations completed (N/A)";
  }

  const lines = [
    "=== Performance Baseline ===",
    `Total run time: ${formatDuration(baseline.totalRunTimeMs)}`,
    `Iterations: ${baseline.iterationCount}`,
    `Avg iteration: ${formatDuration(baseline.avgIterationMs)} (min: ${formatDuration(baseline.minIterationMs)}, max: ${formatDuration(baseline.maxIterationMs)})`,
    `Avg agent call: ${formatDuration(baseline.avgAgentCallMs)}`,
  ];
  return lines.join("\n");
}
