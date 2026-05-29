import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const SCRIPT = join(process.cwd(), "scripts", "diff-ipc-schema.mjs");
function runDiff(baselinePath, currentPath) {
    try {
        const stdout = execSync(`node ${SCRIPT} ${baselinePath} ${currentPath}`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        return { code: 0, stdout, stderr: "" };
    }
    catch (e) {
        const err = e;
        return {
            code: err.status,
            stdout: err.stdout?.toString() ?? "",
            stderr: err.stderr?.toString() ?? "",
        };
    }
}
function makeFixturePair(baseline, current) {
    const dir = mkdtempSync(join(tmpdir(), "diff-ipc-"));
    const baselinePath = join(dir, "baseline.ndjson");
    const currentPath = join(dir, "current.ndjson");
    writeFileSync(baselinePath, baseline.map((l) => `${l}\n`).join(""));
    writeFileSync(currentPath, current.map((l) => `${l}\n`).join(""));
    return { baseline: baselinePath, current: currentPath };
}
describe("diff-ipc-schema.mjs: AC 8.2 — schema regression detection", () => {
    it("exits 0 when current is identical to baseline", () => {
        const { baseline, current } = makeFixturePair([
            `{"event":"version","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z","supported_events":["progress"]}`,
        ], [
            `{"event":"version","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z","supported_events":["progress"]}`,
        ]);
        const res = runDiff(baseline, current);
        expect(res.code).toBe(0);
    });
    it("exits 0 when current adds new fields (forward-compat)", () => {
        const { baseline, current } = makeFixturePair([`{"event":"progress","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z","percent":50}`], [
            `{"event":"progress","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z","percent":50,"new_field":"extra"}`,
        ]);
        const res = runDiff(baseline, current);
        expect(res.code).toBe(0);
    });
    it("exits 0 when current adds new event types (superset)", () => {
        const { baseline, current } = makeFixturePair([`{"event":"progress","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z"}`], [
            `{"event":"progress","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z"}`,
            `{"event":"new_event","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z"}`,
        ]);
        const res = runDiff(baseline, current);
        expect(res.code).toBe(0);
    });
    it("exits non-zero when a baseline field is renamed", () => {
        const { baseline, current } = makeFixturePair([`{"event":"progress","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z","percent":50}`], [`{"event":"progress","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z","percentage":50}`]);
        const res = runDiff(baseline, current);
        expect(res.code).not.toBe(0);
        expect(res.stderr + res.stdout).toMatch(/missing field|percent/i);
    });
    it("exits non-zero when a baseline field type changes", () => {
        const { baseline, current } = makeFixturePair([`{"event":"progress","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z","percent":50}`], [`{"event":"progress","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z","percent":"50"}`]);
        const res = runDiff(baseline, current);
        expect(res.code).not.toBe(0);
        expect(res.stderr + res.stdout).toMatch(/type.*mismatch|percent/i);
    });
    it("exits non-zero when a baseline event type is missing in current", () => {
        const { baseline, current } = makeFixturePair([
            `{"event":"version","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z"}`,
            `{"event":"completion","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z"}`,
        ], [`{"event":"version","run_id":"r1","schema":1,"ts":"2026-05-25T00:00:00Z"}`]);
        const res = runDiff(baseline, current);
        expect(res.code).not.toBe(0);
        expect(res.stderr + res.stdout).toMatch(/missing event|completion/i);
    });
});
//# sourceMappingURL=diff-ipc-schema.test.js.map