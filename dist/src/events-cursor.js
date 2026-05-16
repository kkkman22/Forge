const VALID_PHASES = new Set([
    "plan",
    "build",
    "review",
    "test",
    "ship",
    "learn",
    "decide",
    "spec",
    "debug",
]);
export function parseEventsNdjson(content) {
    const events = [];
    const lines = content.split("\n");
    for (const line of lines) {
        if (!line.trim())
            continue;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            continue;
        }
        if (!isValidEvent(parsed))
            continue;
        events.push(parsed);
    }
    return events;
}
function isValidEvent(obj) {
    if (typeof obj !== "object" || obj === null)
        return false;
    const e = obj;
    if (e.type !== "phase_start" && e.type !== "phase_end")
        return false;
    if (typeof e.ts !== "string")
        return false;
    if (!VALID_PHASES.has(e.phase))
        return false;
    if (typeof e.iteration !== "number")
        return false;
    if (typeof e.session_id !== "string" || !e.session_id)
        return false;
    if (typeof e.wall_clock_elapsed_seconds !== "number")
        return false;
    if (typeof e.token_budget_used !== "number")
        return false;
    if (e.type === "phase_end" && typeof e.exit_code !== "number")
        return false;
    return true;
}
export function extractLatestCursor(events) {
    if (events.length === 0)
        return undefined;
    return events[events.length - 1];
}
//# sourceMappingURL=events-cursor.js.map