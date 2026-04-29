import type { IterationTiming, PerformanceBaseline } from "./types.js";
export declare function createIterationTiming(iterationStartMs: number, agentEndMs: number, effectEndMs: number): IterationTiming;
export declare function computePerformanceBaseline(timings: IterationTiming[]): PerformanceBaseline;
export declare function formatPerformanceBaseline(baseline: PerformanceBaseline): string;
