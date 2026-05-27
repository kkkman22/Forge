/**
 * IpcEmitter — emits stdout NDJSON frames consumed by forge-loop-desktop's
 * `process_manager.rs::write_lines_and_emit_progress`.
 *
 * Frame contract (AC 8.1):
 *   - UTF-8 + `\n` delimited
 *   - single-line JSON
 *   - line ≤ 1024 bytes (oversize is truncated with body field shrunk)
 *   - mandatory fields: event, run_id, schema, ts (ISO-8601)
 *
 * Forward-compat (AC 8.6): adding new fields is safe; old desktop ignores them.
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 8
 *   - apps/forge-loop-desktop/src-tauri/src/process_manager.rs
 */

export const SCHEMA_VERSION = 1;

export const MAX_LINE_BYTES = 1024;

export const SUPPORTED_EVENTS = [
  "version",
  "forge_loop_run_started",
  "iteration_start",
  "iteration_end",
  "progress",
  "message",
  "tool_use",
  "tool_result",
  "completion",
  "run_completed",
  "error",
  "warning",
] as const;

export type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];

export interface EmitOptions {
  runId: string;
  write: (line: string) => void;
}

export interface IpcEmitter {
  emit(event: SupportedEvent | string, payload?: Record<string, unknown>): void;
  emitVersion(): void;
}

export function createIpcEmitter(opts: EmitOptions): IpcEmitter {
  const { runId, write } = opts;

  const emit = (event: SupportedEvent | string, payload: Record<string, unknown> = {}) => {
    const frame = {
      event,
      run_id: runId,
      schema: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      ...payload,
    };
    write(truncateLine(JSON.stringify(frame), MAX_LINE_BYTES));
  };

  const emitVersion = () => {
    write(formatVersionFrame(runId));
  };

  return { emit, emitVersion };
}

export function formatVersionFrame(runId: string): string {
  const frame = {
    event: "version",
    run_id: runId,
    schema: SCHEMA_VERSION,
    ts: new Date().toISOString(),
    supported_events: [...SUPPORTED_EVENTS],
  };
  return truncateLine(JSON.stringify(frame), MAX_LINE_BYTES);
}

export interface ErrorFrameInput {
  runId: string;
  code: string;
  message: string;
  fatal: boolean;
  retryable: boolean;
}

export function formatErrorFrame(input: ErrorFrameInput): string {
  const frame = {
    event: "error",
    run_id: input.runId,
    schema: SCHEMA_VERSION,
    ts: new Date().toISOString(),
    code: input.code,
    message: input.message,
    fatal: input.fatal,
    retryable: input.retryable,
  };
  return truncateLine(JSON.stringify(frame), MAX_LINE_BYTES);
}

export interface WarningFrameInput {
  runId: string;
  code: string;
  message: string;
  attempt?: number;
}

export function formatWarningFrame(input: WarningFrameInput): string {
  const frame: Record<string, unknown> = {
    event: "warning",
    run_id: input.runId,
    schema: SCHEMA_VERSION,
    ts: new Date().toISOString(),
    code: input.code,
    message: input.message,
    fatal: false,
    retryable: false,
  };
  if (input.attempt !== undefined) frame.attempt = input.attempt;
  return truncateLine(JSON.stringify(frame), MAX_LINE_BYTES);
}

/**
 * Truncate the line to at most `maxBytes` UTF-8 bytes while keeping it valid JSON.
 * Strategy: find a string field in the JSON and shrink it; fallback to a short
 * truncation marker frame.
 */
function truncateLine(line: string, maxBytes: number): string {
  if (Buffer.byteLength(line, "utf-8") <= maxBytes) return line;

  // Try parsing and shrinking string values until under cap.
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    return line.slice(0, maxBytes);
  }

  const stringKeys = Object.entries(parsed)
    .filter(([, v]) => typeof v === "string")
    .map(([k]) => k);

  // Iteratively halve each string field until total fits.
  for (const k of stringKeys) {
    if (k === "event" || k === "run_id" || k === "ts") continue;
    while (Buffer.byteLength(JSON.stringify(parsed), "utf-8") > maxBytes) {
      const v = parsed[k] as string;
      if (v.length <= 4) break;
      parsed[k] = `${v.slice(0, Math.max(1, Math.floor(v.length / 2)))}…`;
    }
  }

  parsed.truncated = true;

  let result = JSON.stringify(parsed);
  if (Buffer.byteLength(result, "utf-8") > maxBytes) {
    // Last resort: hard byte-slice; may produce invalid JSON but is rare.
    result = result.slice(0, maxBytes);
  }
  return result;
}
