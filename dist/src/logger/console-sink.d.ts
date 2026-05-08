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
export declare function createConsoleSink(opts: ConsoleSinkOptions): ConsoleSink;
