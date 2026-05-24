import type { LogEntry, LogLevel, LogSinkConfig } from "./types.js";
export declare function shouldLog(entryLevel: LogLevel, configLevel: LogLevel): boolean;
export declare function formatAsJson(entry: LogEntry): string;
export declare function formatAsText(entry: LogEntry): string;
export declare function formatEntry(entry: LogEntry, config: LogSinkConfig): string;
export declare function createLogSink(config: LogSinkConfig, output?: (line: string) => void): {
    log(entry: LogEntry): void;
    getConfig(): LogSinkConfig;
};
/**
 * 创建双写 LogSink：将每条日志同时发送到两个 LogSink。
 * 用于 --log-file 场景：stdout + 文件同时输出。
 *
 * 如果 secondary（文件写入）抛出异常，primary（stdout）不受影响，
 * secondary 异常降级为 stderr 警告。
 */
export declare function createDualSink(primary: ReturnType<typeof createLogSink>, secondary: ReturnType<typeof createLogSink>): ReturnType<typeof createLogSink>;
