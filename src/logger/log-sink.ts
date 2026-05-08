import { createConsoleSink } from "./console-sink.js";
import type { LogEntry, LogLevel, LogSinkConfig } from "./types.js";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape detection requires matching ESC
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const CRLF_RE = /[\r\n]/g;

function sanitizeText(input: string): string {
  return input.replace(ANSI_RE, "").replace(CRLF_RE, " ");
}

export function shouldLog(entryLevel: LogLevel, configLevel: LogLevel): boolean {
  return LEVEL_ORDER[entryLevel] >= LEVEL_ORDER[configLevel];
}

export function formatAsJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

export function formatAsText(entry: LogEntry): string {
  const prefix = `[${entry.level.toUpperCase()}]`;
  const ctx = entry.iteration !== undefined ? ` (iter ${entry.iteration})` : "";
  return `${prefix} ${sanitizeText(entry.event)}${ctx}: ${sanitizeText(entry.message)}`;
}

export function formatEntry(entry: LogEntry, config: LogSinkConfig): string {
  if (config.format === "json") {
    return formatAsJson(entry);
  }
  return formatAsText(entry);
}

export function createLogSink(config: LogSinkConfig, output?: (line: string) => void) {
  const consoleSink = output
    ? undefined
    : createConsoleSink({ format: config.format, minLevel: config.level });
  return {
    log(entry: LogEntry): void {
      if (!shouldLog(entry.level, config.level)) return;
      if (output) {
        output(formatEntry(entry, config));
      } else {
        consoleSink?.write(entry);
      }
    },
    getConfig(): LogSinkConfig {
      return config;
    },
  };
}

/**
 * 创建双写 LogSink：将每条日志同时发送到两个 LogSink。
 * 用于 --log-file 场景：stdout + 文件同时输出。
 *
 * 如果 secondary（文件写入）抛出异常，primary（stdout）不受影响，
 * secondary 异常降级为 stderr 警告。
 */
export function createDualSink(
  primary: ReturnType<typeof createLogSink>,
  secondary: ReturnType<typeof createLogSink>,
): ReturnType<typeof createLogSink> {
  const errorSink = createConsoleSink({ format: "text", minLevel: "warn" });
  return {
    log(entry: LogEntry): void {
      primary.log(entry);
      try {
        secondary.log(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errorSink.write({
          timestamp: new Date().toISOString(),
          level: "warn",
          event: "secondary_sink_failed",
          message: `Secondary log sink failed: ${message}`,
        });
      }
    },
    getConfig(): LogSinkConfig {
      return primary.getConfig();
    },
  };
}
