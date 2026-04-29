import type { LogEntry, LogLevel, LogSinkConfig } from "./types.js";
export declare function shouldLog(entryLevel: LogLevel, configLevel: LogLevel): boolean;
export declare function formatAsJson(entry: LogEntry): string;
export declare function formatAsText(entry: LogEntry): string;
export declare function formatEntry(entry: LogEntry, config: LogSinkConfig): string;
export declare function createLogSink(config: LogSinkConfig, output?: (line: string) => void): {
    log(entry: LogEntry): void;
    getConfig(): LogSinkConfig;
};
