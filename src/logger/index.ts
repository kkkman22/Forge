export { createLogEntry } from "./log-entry.js";
export { createConsoleSink } from "./console-sink.js";
export type { ConsoleSink, ConsoleSinkOptions } from "./console-sink.js";
export { createFileWriter, validateFileWritable } from "./log-file-writer.js";
export {
  createDualSink,
  createLogSink,
  formatAsJson,
  formatAsText,
  formatEntry,
  shouldLog,
} from "./log-sink.js";
export type { DegradationResult, SubagentTiming } from "./timing.js";
export {
  buildSubagentTiming,
  computeExtendedBaseline,
  computePerformanceBaseline,
  createIterationTiming,
  detectDegradation,
  formatPerformanceBaseline,
} from "./timing.js";
export type {
  IterationTiming,
  LogEntry,
  LogLevel,
  LogSinkConfig,
  PerformanceBaseline,
} from "./types.js";
