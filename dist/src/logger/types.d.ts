export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    event: string;
    message: string;
    runId?: string;
    iteration?: number;
    phase?: string;
    branchName?: string;
    commitCount?: number;
    metadata?: Record<string, unknown>;
}
export interface IterationTiming {
    iterationStartMs: number;
    agentCallDurationMs: number;
    effectExecutionDurationMs: number;
    totalIterationDurationMs: number;
}
export interface PerformanceBaseline {
    totalRunTimeMs: number;
    iterationCount: number;
    avgIterationMs: number;
    maxIterationMs: number;
    minIterationMs: number;
    avgAgentCallMs: number;
    /** Subagent 调用总次数 */
    subagentCallCount?: number;
    /** Subagent 平均耗时（毫秒） */
    avgSubagentMs?: number;
    /** Subagent 最大耗时（毫秒） */
    maxSubagentMs?: number;
    /** 运行期间触发的退化告警次数 */
    degradationCount?: number;
}
export interface LogSinkConfig {
    format: "text" | "json";
    level: LogLevel;
}
