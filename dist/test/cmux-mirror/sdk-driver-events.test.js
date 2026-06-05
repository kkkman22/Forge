import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeEvent } from "../../src/event-writer.js";
let tmpDir;
let eventsPath;
beforeEach(() => {
    tmpDir = join(tmpdir(), `cmux-events-write-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    eventsPath = join(tmpDir, "events.ndjson");
});
afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
});
function readEvents() {
    const content = readFileSync(eventsPath, "utf-8");
    return content
        .trim()
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
}
describe("writeEvent: Events_NDJSON writer (R14.1, R14.2, R14.8)", () => {
    it("appends a valid NDJSON line with schema_version and ts", () => {
        writeEvent(eventsPath, "session_started", { run_id: "r1" });
        const events = readEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            schema_version: 1,
            type: "session_started",
            run_id: "r1",
        });
        expect(events[0]).toHaveProperty("ts");
    });
    it("appends multiple events in order", () => {
        writeEvent(eventsPath, "session_started", { run_id: "r1" });
        writeEvent(eventsPath, "iter_started", { run_id: "r1", iteration: 1 });
        writeEvent(eventsPath, "iter_committed", {
            run_id: "r1",
            iteration: 1,
            commit_sha: "abc123",
        });
        const events = readEvents();
        expect(events).toHaveLength(3);
        expect(events[0].type).toBe("session_started");
        expect(events[1].type).toBe("iter_started");
        expect(events[2].type).toBe("iter_committed");
    });
    it("redacts sensitive keys (R14.8)", () => {
        writeEvent(eventsPath, "test", {
            api_key: "sk-secret123",
            safe_field: "visible",
            token: "ghp_abc123",
        });
        const events = readEvents();
        expect(events[0].api_key).toBe("[REDACTED]");
        expect(events[0].token).toBe("[REDACTED]");
        expect(events[0].safe_field).toBe("visible");
    });
    it("redacts sensitive value patterns (R14.8)", () => {
        writeEvent(eventsPath, "test", {
            env_var: "sk-proj-abc123def456",
            normal: "just a string",
        });
        const events = readEvents();
        expect(events[0].env_var).toBe("[REDACTED]");
        expect(events[0].normal).toBe("just a string");
    });
    it("handles empty payload", () => {
        writeEvent(eventsPath, "loop_terminated");
        const events = readEvents();
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("loop_terminated");
    });
    it("does not throw on write failure (R11.2)", () => {
        const badPath = "/nonexistent/deep/path/events.ndjson";
        expect(() => writeEvent(badPath, "test", { a: 1 })).not.toThrow();
    });
    it("creates parent directories if missing", () => {
        const deepPath = join(tmpDir, "a", "b", "c", "events.ndjson");
        writeEvent(deepPath, "test", { ok: true });
        const events = JSON.parse(readFileSync(deepPath, "utf-8"));
        expect(events.type).toBe("test");
    });
    it("includes trace_id as top-level field when options.trace_id is provided", () => {
        writeEvent(eventsPath, "session_started", { run_id: "r1" }, { trace_id: "trace_20260606T1437_abc123" });
        const events = readEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            schema_version: 1,
            type: "session_started",
            trace_id: "trace_20260606T1437_abc123",
            run_id: "r1",
        });
    });
    it("does not include trace_id when options is omitted", () => {
        writeEvent(eventsPath, "session_started", { run_id: "r1" });
        const events = readEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).not.toHaveProperty("trace_id");
    });
});
//# sourceMappingURL=sdk-driver-events.test.js.map