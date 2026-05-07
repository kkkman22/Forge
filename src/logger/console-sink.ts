/**
 * ConsoleSink — the single exit point for user-visible console output.
 *
 * All `src/` code should route log output through `ConsoleSink` instead of
 * calling `console.*` directly. This module contains the only allowed
 * `console.log` / `console.error` calls in the `src/` tree (each guarded by
 * a Biome suppression comment).
 *
 * **Validates: v2.4 Requirement 6.3, 6.4**
 */

import { formatAsJson, formatAsText, shouldLog } from "./log-sink.js";
import type { LogEntry, LogLevel } from "./types.js";

export interface ConsoleSinkOptions {
  /** Output format: human-readable text or structured JSON. */
  format: "text" | "json";
  /** Minimum log level to emit. */
  minLevel?: LogLevel;
}

export interface ConsoleSink {
  write(entry: LogEntry): void;
}

const DEFAULT_LEVEL: LogLevel = "info";

export function createConsoleSink(opts: ConsoleSinkOptions): ConsoleSink {
  const minLevel = opts.minLevel ?? DEFAULT_LEVEL;
  const format = opts.format;

  return {
    write(entry: LogEntry): void {
      if (!shouldLog(entry.level, minLevel)) return;

      const line = format === "json" ? formatAsJson(entry) : formatAsText(entry);
      const isErrorOrWarn = entry.level === "error" || entry.level === "warn";

      if (isErrorOrWarn) {
        // biome-ignore lint/suspicious/noConsole: ConsoleSink is the single exit point for stderr output
        console.error(line);
      } else {
        // biome-ignore lint/suspicious/noConsole: ConsoleSink is the single exit point for stdout output
        console.log(line);
      }
    },
  };
}
