import type { LogEntry, LogLevel } from "./types.js";
export interface LogContext {
    runId?: string;
    iteration?: number;
    phase?: string;
    branchName?: string;
    commitCount?: number;
}
export declare function createLogEntry(event: string, level: LogLevel, message: string, context?: LogContext, metadata?: Record<string, unknown>): LogEntry;
