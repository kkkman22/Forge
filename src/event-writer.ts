import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Append a structured event to the Events_NDJSON log (R14.1, R14.2).
 * Each event line: { schema_version: 1, ts, type, ...payload }
 * Redaction: omits payload values matching common secret patterns (R14.8).
 */
export function writeEvent(
  eventsPath: string,
  type: string,
  payload: Record<string, unknown> = {},
): void {
  try {
    mkdirSync(path.dirname(eventsPath), { recursive: true });
    const entry: Record<string, unknown> = {
      schema_version: 1,
      ts: new Date().toISOString(),
      type,
      ...redactSensitive(payload),
    };
    appendFileSync(eventsPath, `${JSON.stringify(entry)}\n`, "utf-8");
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
