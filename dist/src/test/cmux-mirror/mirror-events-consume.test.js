import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
describe("mirror: event consumption from events.ndjson (R14)", () => {
    let dir;
    let eventsPath;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "cmux-events-consume-"));
        eventsPath = join(dir, "events.ndjson");
    });
    afterEach(() => {
        try {
            rmSync(dir, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    });
    it("reads events since cursor and returns parsed objects", async () => {
        const { readEventsSince } = await import("../../scripts/cmux-mirror/lib/events.mjs");
        writeFileSync(eventsPath, `${[
            JSON.stringify({ schema_version: 1, type: "session_started", run_id: "r1" }),
            JSON.stringify({ schema_version: 1, type: "iter_started", run_id: "r1", iteration: 1 }),
            JSON.stringify({ schema_version: 1, type: "circuit_breaker_tripped", run_id: "r1" }),
        ].join("\n")}\n`);
        const { events, cursor } = await readEventsSince(eventsPath, 0);
        expect(events).toHaveLength(3);
        expect(events[0].type).toBe("session_started");
        expect(events[1].type).toBe("iter_started");
        expect(events[2].type).toBe("circuit_breaker_tripped");
        expect(cursor).toBeGreaterThan(0);
    });
    it("returns only new events after cursor position", async () => {
        const { readEventsSince } = await import("../../scripts/cmux-mirror/lib/events.mjs");
        const line1 = JSON.stringify({ schema_version: 1, type: "session_started", run_id: "r1" });
        writeFileSync(eventsPath, `${line1}\n`);
        const first = await readEventsSince(eventsPath, 0);
        expect(first.events).toHaveLength(1);
        // Append more events
        const line2 = JSON.stringify({
            schema_version: 1,
            type: "iter_started",
            run_id: "r1",
            iteration: 1,
        });
        const line3 = JSON.stringify({
            schema_version: 1,
            type: "circuit_breaker_tripped",
            run_id: "r1",
        });
        writeFileSync(eventsPath, `${[line1, line2, line3].join("\n")}\n`);
        const second = await readEventsSince(eventsPath, first.cursor);
        expect(second.events).toHaveLength(2);
        expect(second.events[0].type).toBe("iter_started");
        expect(second.events[1].type).toBe("circuit_breaker_tripped");
    });
    it("session tracker transitions to active on event", async () => {
        const { createSessionTracker } = await import("../../scripts/cmux-mirror/lib/session.mjs");
        const transitions = [];
        const tracker = createSessionTracker({
            defaultBudget: 20,
            onStatusChange(_wsRef, from, to) {
                transitions.push({ from, to });
            },
        });
        expect(tracker.getState("ws1")).toBe("unknown");
        tracker.onEvent("ws1", "session_started");
        expect(tracker.getState("ws1")).toBe("active");
        expect(transitions).toHaveLength(1);
        expect(transitions[0]).toEqual({ from: "unknown", to: "active" });
    });
    it("tolerates malformed lines in events.ndjson", async () => {
        const { readEventsSince } = await import("../../scripts/cmux-mirror/lib/events.mjs");
        writeFileSync(eventsPath, `${[
            "not json",
            JSON.stringify({ schema_version: 1, type: "session_started", run_id: "r1" }),
            "{broken",
            JSON.stringify({ schema_version: 1, type: "iter_started", run_id: "r1", iteration: 1 }),
        ].join("\n")}\n`);
        const { events } = await readEventsSince(eventsPath, 0);
        expect(events).toHaveLength(2);
        expect(events[0].type).toBe("session_started");
        expect(events[1].type).toBe("iter_started");
    });
});
//# sourceMappingURL=mirror-events-consume.test.js.map