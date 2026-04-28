export { createLogEntry } from "./log-entry.js";
export {
  createLogSink,
  formatAsJson,
  formatAsText,
  formatEntry,
  shouldLog,
} from "./log-sink.js";
export {
  computePerformanceBaseline,
  createIterationTiming,
} from "./timing.js";
export type {
  IterationTiming,
  LogEntry,
  LogLevel,
  LogSinkConfig,
  PerformanceBaseline,
} from "./types.js";
