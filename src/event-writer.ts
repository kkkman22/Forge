import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { acquireLockSync, releaseLockSync } from "./tool-health-writer.js";

/**
 * Append a structured event to the Events_NDJSON log (R14.1, R14.2).
 * Each event line: { schema_version: 1, ts, type, ...payload }
 * Redaction: omits payload values matching common secret patterns (R14.8).
 *
 * P2-3c: lock-protected + payload-bounded. The prior bare appendFileSync
 * interleaved across concurrent writers once the line exceeded PIPE_BUF,
 * corrupting the NDJSON stream (tool-health-writer already locks for the same
 * reason — inconsistency flagged in the review).
 */
const MAX_PAYLOAD_CHARS = 8192;

export function writeEvent(
  eventsPath: string,
  type: string,
  payload: Record<string, unknown> = {},
  options?: { trace_id?: string },
): void {
  try {
    mkdirSync(path.dirname(eventsPath), { recursive: true });
    const redacted = redactSensitive(payload);
    const entry: Record<string, unknown> = {
      schema_version: 1,
      ts: new Date().toISOString(),
      type,
      ...redacted,
      ...(options?.trace_id ? { trace_id: options.trace_id } : {}),
    };
    let line = JSON.stringify(entry);
    // Bound the line length so a single event can't blow past PIPE_BUF on its
    // own; mark truncation so consumers know the payload was trimmed.
    if (line.length > MAX_PAYLOAD_CHARS) {
      const trimmed = { ...entry, payload: { truncated: true, original_length: line.length } };
      line = JSON.stringify(trimmed).slice(0, MAX_PAYLOAD_CHARS);
    }
    const lockPath = `${eventsPath}.lock`;
    try {
      acquireLockSync(lockPath, { timeoutMs: 2000, staleLockMs: 30_000 });
    } catch {
      // Lock contention/timeout — fail-open (R11.2): best-effort append
      // without the lock rather than blocking the driver. Low-frequency path.
      appendFileSync(eventsPath, `${line}\n`, "utf-8");
      return;
    }
    try {
      appendFileSync(eventsPath, `${line}\n`, "utf-8");
    } finally {
      releaseLockSync(lockPath);
    }
  } catch (_err: unknown) {
    // Best-effort — never block the driver on event write failure (R11.2)
  }
}

const SENSITIVE_KEY_PATTERN = /token|secret|password|api_key|apikey|auth/i;
const SENSITIVE_VALUE_PATTERN = /^(?:sk-|ghp_|glpat-|xox[bpas]-|AKIA)/i;

function redactSensitive(payload: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      safe[key] = "[REDACTED]";
    } else if (typeof value === "string" && SENSITIVE_VALUE_PATTERN.test(value)) {
      safe[key] = "[REDACTED]";
    } else {
      safe[key] = value;
    }
  }
  return safe;
}
