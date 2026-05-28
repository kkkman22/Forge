/**
 * IPC compatibility test (AC 8.5 / 8.6 / 8.7 / 8.8).
 *
 * This is a Node-side simulation of the desktop parser contract: the actual
 * Rust `process_manager.rs::write_lines_and_emit_progress` test belongs in
 * `apps/forge-loop-desktop/src-tauri/`. This file validates the IPC NDJSON
 * forward-compatibility contract:
 *   - first frame is a `version` handshake (8.5)
 *   - parser tolerates unknown fields, unknown event types, and oversized
 *     lines without throwing (8.6)
 *   - baseline contains zero `partial` / `message_delta` events (8.7)
 *   - baseline diffed against itself via diff-ipc-schema.mjs exits 0 (8.8)
 *
 * The fixture `apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson` is
 * the canonical baseline per Requirement 8.2.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const REPO_ROOT = resolve(__dirname, "../..");
const BASELINE_PATH = resolve(REPO_ROOT, "apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson");
const DIFF_SCRIPT = resolve(REPO_ROOT, "scripts/diff-ipc-schema.mjs");
const KNOWN_EVENTS = new Set([
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
]);
function parseNdjsonLenient(text) {
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const out = [];
    for (const line of lines) {
        try {
            out.push(JSON.parse(line));
        }
        catch {
            // desktop simulates "ignore unknown line"; do not throw.
        }
    }
    return out;
}
describe("IPC compat (AC 8.5) — version handshake", () => {
    it("first frame is event=version with schema and supported_events", () => {
        const frames = parseNdjsonLenient(readFileSync(BASELINE_PATH, "utf-8"));
        expect(frames.length).toBeGreaterThan(0);
        const first = frames[0];
        expect(first.event).toBe("version");
        expect(typeof first.schema).toBe("number");
        expect(Number.isInteger(first.schema)).toBe(true);
        expect(Array.isArray(first.supported_events)).toBe(true);
        for (const evt of first.supported_events) {
            expect(typeof evt).toBe("string");
        }
    });
});
describe("IPC compat (AC 8.6) — forward-compat: unknown fields/events/oversized lines", () => {
    it("ignores frames containing unknown fields", () => {
        const text = `{"event":"progress","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z","mystery_field":42}\n`;
        const frames = parseNdjsonLenient(text);
        expect(frames.length).toBe(1);
        expect(frames[0].event).toBe("progress");
    });
    it("classifies unknown event types as known-but-unhandled (no throw)", () => {
        const text = `{"event":"my_new_event","run_id":"r1","schema":99,"ts":"2026-05-25T00:00:00Z"}\n`;
        const frames = parseNdjsonLenient(text);
        expect(frames.length).toBe(1);
        expect(KNOWN_EVENTS.has(frames[0].event)).toBe(false);
    });
    it("does not throw on oversized lines (>1024 bytes from upstream)", () => {
        const long = `{"event":"progress","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z","filler":"${"x".repeat(2000)}"}\n`;
        const frames = parseNdjsonLenient(long);
        expect(frames.length).toBe(1);
        expect(frames[0].event).toBe("progress");
    });
    it("future schema version still parses known events (forward-compat)", () => {
        const text = `{"event":"version","run_id":"r1","schema":99,"ts":"2026-05-25T00:00:00Z","supported_events":["progress","new_thing"]}\n{"event":"forge_loop_run_started","run_id":"r1","schema":99,"ts":"2026-05-25T00:00:01Z"}\n`;
        const frames = parseNdjsonLenient(text);
        expect(frames.length).toBe(2);
        expect(frames[0].schema).toBe(99);
        expect(frames[1].event).toBe("forge_loop_run_started");
    });
});
describe("IPC compat (AC 8.7) — no partial/message_delta leakage", () => {
    it("baseline contains zero `partial` or `message_delta` events", () => {
        const frames = parseNdjsonLenient(readFileSync(BASELINE_PATH, "utf-8"));
        const partials = frames.filter((f) => f.event === "partial" || f.event === "message_delta");
        expect(partials.length).toBe(0);
    });
});
describe("IPC compat (AC 8.8) — diff-ipc-schema regression vs self", () => {
    it("baseline diffed against itself exits 0", () => {
        const out = execSync(`node ${DIFF_SCRIPT} ${BASELINE_PATH} ${BASELINE_PATH}`, {
            encoding: "utf-8",
        });
        expect(out).toMatch(/diff OK/i);
    });
});
//# sourceMappingURL=ipc-compat.test.js.map