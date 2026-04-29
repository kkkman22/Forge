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
export declare function buildSubagentTiming(subagentId: string, startMs: number, endMs: number): SubagentTiming;
/**
 * 检测性能退化（纯函数）。
 *
 * 规则：
 * - 如果历史迭代数 < 3，返回 { isDegraded: false }（样本不足）
 * - 计算历史迭代的滚动平均值（基于 totalIterationDurationMs）
 * - 如果当前耗时 > 滚动平均值 × 2，判定为退化
 */
export declare function detectDegradation(currentDurationMs: number, previousTimings: IterationTiming[]): DegradationResult;
export declare function createIterationTiming(iterationStartMs: number, agentEndMs: number, effectEndMs: number): IterationTiming;
export declare function computePerformanceBaseline(timings: IterationTiming[]): PerformanceBaseline;
/**
 * 计算扩展的 PerformanceBaseline（纯函数）。
 * 在现有 computePerformanceBaseline 基础上追加 Subagent 统计和退化计数。
 */
export declare function computeExtendedBaseline(timings: IterationTiming[], subagentTimings: SubagentTiming[], degradationCount: number): PerformanceBaseline;
export declare function formatPerformanceBaseline(baseline: PerformanceBaseline): string;
