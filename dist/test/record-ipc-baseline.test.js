import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
const FIXTURE_PATH = join(process.cwd(), "apps", "forge-loop-desktop", "test", "fixtures", "ipc-baseline.ndjson");
describe("T17: IPC baseline fixture", () => {
    it("fixture file exists", () => {
        expect(existsSync(FIXTURE_PATH)).toBe(true);
    });
    it("fixture contains valid NDJSON", () => {
        const content = readFileSync(FIXTURE_PATH, "utf-8").trim();
        expect(content.length).toBeGreaterThan(0);
        const lines = content.split("\n").filter(Boolean);
        expect(lines.length).toBeGreaterThanOrEqual(10);
        for (const line of lines) {
            const parsed = JSON.parse(line);
            expect(parsed).toHaveProperty("event");
            expect(parsed).toHaveProperty("run_id");
            expect(parsed).toHaveProperty("schema");
            expect(parsed).toHaveProperty("ts");
        }
    });
    it("fixture contains all required event types", () => {
        const content = readFileSync(FIXTURE_PATH, "utf-8").trim();
        const events = content
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line).event);
        const required = [
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
        ];
        for (const evt of required) {
            expect(events).toContain(evt);
        }
    });
    it("fixture uses fixed run_id and timestamps", () => {
        const content = readFileSync(FIXTURE_PATH, "utf-8").trim();
        const lines = content.split("\n").filter(Boolean);
        for (const line of lines) {
            const parsed = JSON.parse(line);
            expect(parsed.run_id).toBe("baseline-run-001");
            expect(parsed.ts).toMatch(/^2026-01-15T/);
        }
    });
    it("schema version is 1", () => {
        const content = readFileSync(FIXTURE_PATH, "utf-8").trim();
        const lines = content.split("\n").filter(Boolean);
        for (const line of lines) {
            const parsed = JSON.parse(line);
            expect(parsed.schema).toBe(1);
        }
    });
});
describe("T19: diffIpcSchema type checking", () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = join(tmpdir(), `ipc-diff-test-${Date.now()}`);
        mkdirSync(tmpDir, { recursive: true });
    });
    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });
    it("returns ok when comparing baseline to itself", () => {
        if (!existsSync(FIXTURE_PATH)) {
            expect.unreachable("Fixture does not exist, run record-ipc-baseline.mjs first");
        }
        const result = execSync(`node scripts/diff-ipc-schema.mjs "${FIXTURE_PATH}" "${FIXTURE_PATH}"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        expect(result).toContain("OK");
    });
    it("detects missing event type", () => {
        const baseline = join(tmpDir, "baseline.ndjson");
        const current = join(tmpDir, "current.ndjson");
        writeFileSync(baseline, `${[
            JSON.stringify({
                event: "unique_test_event",
                run_id: "r1",
                schema: 1,
                ts: "2026-01-01T00:00:00.000Z",
            }),
        ].join("\n")}\n`);
        writeFileSync(current, `${[
            JSON.stringify({
                event: "other_event",
                run_id: "r2",
                schema: 1,
                ts: "2026-01-01T00:00:00.000Z",
            }),
        ].join("\n")}\n`);
        expect(() => {
            execSync(`node scripts/diff-ipc-schema.mjs "${baseline}" "${current}"`, {
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"],
            });
        }).toThrow(/missing event type/);
    });
    it("detects missing field", () => {
        const baseline = join(tmpDir, "baseline.ndjson");
        const current = join(tmpDir, "current.ndjson");
        writeFileSync(baseline, `${[
            JSON.stringify({
                event: "iteration_start",
                run_id: "r1",
                schema: 1,
                ts: "2026-01-01T00:00:00.000Z",
                iteration: 1,
            }),
        ].join("\n")}\n`);
        writeFileSync(current, `${[
            JSON.stringify({
                event: "iteration_start",
                run_id: "r2",
                schema: 1,
                ts: "2026-01-01T00:00:00.000Z",
            }),
        ].join("\n")}\n`);
        expect(() => {
            execSync(`node scripts/diff-ipc-schema.mjs "${baseline}" "${current}"`, {
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"],
            });
        }).toThrow(/missing field/);
    });
    it("detects type mismatch", () => {
        const baseline = join(tmpDir, "baseline.ndjson");
        const current = join(tmpDir, "current.ndjson");
        writeFileSync(baseline, `${[
            JSON.stringify({
                event: "iteration_start",
                run_id: "r1",
                schema: 1,
                ts: "2026-01-01T00:00:00.000Z",
                iteration: 1,
            }),
        ].join("\n")}\n`);
        writeFileSync(current, `${[
            JSON.stringify({
                event: "iteration_start",
                run_id: "r2",
                schema: 1,
                ts: "2026-01-01T00:00:00.000Z",
                iteration: "not-a-number",
            }),
        ].join("\n")}\n`);
        expect(() => {
            execSync(`node scripts/diff-ipc-schema.mjs "${baseline}" "${current}"`, {
                encoding: "utf-8",
                stdio: ["pipe", "pipe", "pipe"],
            });
        }).toThrow(/type mismatch/);
    });
    it("allows new fields in current (extension is compatible)", () => {
        const baseline = join(tmpDir, "baseline.ndjson");
        const current = join(tmpDir, "current.ndjson");
        writeFileSync(baseline, `${[
            JSON.stringify({
                event: "iteration_start",
                run_id: "r1",
                schema: 1,
                ts: "2026-01-01T00:00:00.000Z",
                iteration: 1,
            }),
        ].join("\n")}\n`);
        writeFileSync(current, `${[
            JSON.stringify({
                event: "iteration_start",
                run_id: "r2",
                schema: 1,
                ts: "2026-01-01T00:00:00.000Z",
                iteration: 1,
                new_field: "extra",
            }),
        ].join("\n")}\n`);
        const result = execSync(`node scripts/diff-ipc-schema.mjs "${baseline}" "${current}"`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        expect(result).toContain("OK");
    });
});
//# sourceMappingURL=record-ipc-baseline.test.js.map