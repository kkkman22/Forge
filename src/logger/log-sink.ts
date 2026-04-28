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

export function createLogSink(config: LogSinkConfig, output: (line: string) => void = console.log) {
  return {
    log(entry: LogEntry): void {
      if (!shouldLog(entry.level, config.level)) return;
      output(formatEntry(entry, config));
    },
    getConfig(): LogSinkConfig {
      return config;
    },
  };
}
