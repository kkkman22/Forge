import type { IterationTiming, PerformanceBaseline } from "./types.js";

/** Subagent 执行计时数据 */
export interface SubagentTiming {
  /** Subagent 标识符 */
  subagentId: string;
  /** 启动时间戳（毫秒） */
  startMs: number;
  /** 完成时间戳（毫秒） */
  endMs: number;
  /** 总耗时（毫秒），等于 endMs - startMs */
  durationMs: number;
}

/** 退化检测结果 */
export interface DegradationResult {
  /** 是否检测到退化 */
  isDegraded: boolean;
  /** 当前迭代耗时 */
  currentMs: number;
  /** 滚动平均值 */
  rollingAvgMs: number;
  /** 偏差倍数（currentMs / rollingAvgMs） */
  deviationFactor: number;
}

/**
 * 构建 SubagentTiming（纯函数）。
 * 如果 endMs < startMs（时钟回拨），durationMs clamp 到 0。
 */
export function buildSubagentTiming(
  subagentId: string,
  startMs: number,
  endMs: number,
): SubagentTiming {
  const durationMs = endMs >= startMs ? endMs - startMs : 0;
  return { subagentId, startMs, endMs, durationMs };
}

/**
 * 检测性能退化（纯函数）。
 *
 * 规则：
 * - 如果历史迭代数 < 3，返回 { isDegraded: false }（样本不足）
 * - 计算历史迭代的滚动平均值（基于 totalIterationDurationMs）
 * - 如果当前耗时 > 滚动平均值 × 2，判定为退化
 */
export function detectDegradation(
  currentDurationMs: number,
  previousTimings: IterationTiming[],
): DegradationResult {
  if (previousTimings.length < 3) {
    return {
      isDegraded: false,
      currentMs: currentDurationMs,
      rollingAvgMs: 0,
      deviationFactor: 0,
    };
  }

  const sum = previousTimings.reduce((acc, t) => acc + t.totalIterationDurationMs, 0);
  const rollingAvgMs = sum / previousTimings.length;
  const deviationFactor = rollingAvgMs > 0 ? currentDurationMs / rollingAvgMs : 0;
  const isDegraded = currentDurationMs > rollingAvgMs * 2;

  return { isDegraded, currentMs: currentDurationMs, rollingAvgMs, deviationFactor };
}

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

/**
 * 计算扩展的 PerformanceBaseline（纯函数）。
 * 在现有 computePerformanceBaseline 基础上追加 Subagent 统计和退化计数。
 */
export function computeExtendedBaseline(
  timings: IterationTiming[],
  subagentTimings: SubagentTiming[],
  degradationCount: number,
): PerformanceBaseline {
  const base = computePerformanceBaseline(timings);

  if (subagentTimings.length === 0) {
    return {
      ...base,
      degradationCount,
    };
  }

  const durations = subagentTimings.map((t) => t.durationMs);
  const sum = durations.reduce((a, b) => a + b, 0);

  return {
    ...base,
    subagentCallCount: subagentTimings.length,
    avgSubagentMs: sum / subagentTimings.length,
    maxSubagentMs: durations.reduce((a, b) => Math.max(a, b), -Infinity),
    degradationCount,
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

  if (baseline.subagentCallCount !== undefined && baseline.subagentCallCount > 0) {
    lines.push(
      `Subagent calls: ${baseline.subagentCallCount} (avg: ${formatDuration(baseline.avgSubagentMs ?? 0)}, max: ${formatDuration(baseline.maxSubagentMs ?? 0)})`,
    );
  } else {
    lines.push("Subagent calls: N/A");
  }

  lines.push(`Degradation alerts: ${baseline.degradationCount ?? 0}`);

  return lines.join("\n");
}
