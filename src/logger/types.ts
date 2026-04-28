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
}

export interface LogSinkConfig {
  format: "text" | "json";
  level: LogLevel;
}
