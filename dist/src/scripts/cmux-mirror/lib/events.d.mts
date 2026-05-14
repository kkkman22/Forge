/**
 * Read Events_NDJSON entries from `path` starting after byte `cursor`.
 * Tolerates malformed lines (R12.11). Optional schema_version filter (R14.9).
 * Returns { events: object[], cursor: number }.
 */
export function readEventsSince(path: any, cursor: any, { schemaVersion }?: {}): Promise<{
    events: any[];
    cursor: any;
}>;
