/**
 * Append a structured event to the Events_NDJSON log (R14.1, R14.2).
 * Each event line: { schema_version: 1, ts, type, ...payload }
 * Redaction: omits payload values matching common secret patterns (R14.8).
 */
export declare function writeEvent(eventsPath: string, type: string, payload?: Record<string, unknown>): void;
