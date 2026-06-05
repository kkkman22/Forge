import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dispatch, writeDispatchRecord } from "../../src/workflow-dispatcher.js";
const REQUIRED_FIELDS = [
    "subcommand",
    "mode",
    "run_id",
    "session_id",
    "workflow_state_id",
    "workflow_version",
    "gate_enabled",
    "workflow_available",
    "chosen_level",
    "exit_code",
    "duration_ms",
    "timestamp",
    "frozen_zone_blocked",
];
// l1_trigger_reason and l0_failure_signature are optional
const TOTAL_REQUIRED_FIELDS = REQUIRED_FIELDS.length;
const NUM_RUNS = process.env.CI ? 100 : 1000;
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
function isValidIso8601(s) {
    return ISO_8601_RE.test(s) && !Number.isNaN(Date.parse(s));
}
describe("R2.5: dispatch JSONL schema property", () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = join(tmpdir(), `jsonl-prop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        mkdirSync(tmpDir, { recursive: true });
        mkdirSync(join(tmpDir, ".forge", "runs"), { recursive: true });
        delete process.env.CLAUDE_CODE_WORKFLOWS;
    });
    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
        delete process.env.CLAUDE_CODE_WORKFLOWS;
    });
    function makeCtx(overrides = {}) {
        return {
            subcommand: "review",
            runId: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            sessionId: "sess-jsonl",
            mode: "interactive",
            forgeRoot: join(tmpDir, ".forge"),
            pluginRoot: tmpDir,
            traceId: "trace_20260606T1437_prop",
            ...overrides,
        };
    }
    it("writeDispatchRecord always produces JSONL with all 14 required fields and valid ISO-8601 timestamp", () => {
        fc.assert(fc.property(fc.record({
            subcommand: fc.constantFrom("review", "decide", "learn"),
            mode: fc.constantFrom("interactive", "loop"),
            gate_enabled: fc.boolean(),
            workflow_available: fc.boolean(),
            chosen_level: fc.constantFrom("L0", "L1", "L3"),
            exit_code: fc.integer({ min: 0, max: 255 }),
            duration_ms: fc.integer({ min: 0, max: 3_600_000 }),
            frozen_zone_blocked: fc.boolean(),
        }), (fields) => {
            const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const record = {
                subcommand: fields.subcommand,
                mode: fields.mode,
                run_id: runId,
                session_id: "sess-001",
                workflow_state_id: `wsid_${runId}_review_${Date.now()}`,
                workflow_version: "1.0.0",
                gate_enabled: fields.gate_enabled,
                workflow_available: fields.workflow_available,
                chosen_level: fields.chosen_level,
                exit_code: fields.exit_code,
                duration_ms: fields.duration_ms,
                timestamp: new Date().toISOString(),
                frozen_zone_blocked: fields.frozen_zone_blocked,
            };
            const runDir = join(tmpDir, ".forge", "runs", runId);
            mkdirSync(runDir, { recursive: true });
            writeDispatchRecord(runDir, record);
            const content = readFileSync(join(runDir, "dispatch.jsonl"), "utf-8").trim();
            const parsed = JSON.parse(content);
            for (const field of REQUIRED_FIELDS) {
                expect(parsed).toHaveProperty(field);
            }
            const fieldCount = Object.keys(parsed).length;
            expect(fieldCount).toBeGreaterThanOrEqual(TOTAL_REQUIRED_FIELDS);
            expect(typeof parsed.run_id).toBe("string");
            expect(parsed.run_id.length).toBeGreaterThan(0);
            expect(typeof parsed.exit_code).toBe("number");
            expect(Number.isInteger(parsed.exit_code)).toBe(true);
            expect(isValidIso8601(parsed.timestamp)).toBe(true);
        }), { numRuns: NUM_RUNS });
    });
    it("dispatch() always writes a JSONL line with all required fields and valid ISO-8601 timestamp", async () => {
        await fc.assert(fc.asyncProperty(fc.record({
            subcommand: fc.constantFrom("review", "decide", "learn"),
            mode: fc.constantFrom("interactive", "loop"),
            allFallbacksFailed: fc.boolean(),
        }), async ({ subcommand, mode, allFallbacksFailed }) => {
            delete process.env.CLAUDE_CODE_WORKFLOWS;
            const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const ctx = makeCtx({ subcommand, mode, runId });
            const result = await dispatch(ctx, {
                allFallbacksFailed,
                runFallback: async () => allFallbacksFailed ? null : { output: "fb", methodology: "subagent-parallel" },
            });
            const record = result.record;
            for (const field of REQUIRED_FIELDS) {
                expect(record).toHaveProperty(field);
            }
            expect(typeof record.run_id).toBe("string");
            expect(record.run_id.length).toBeGreaterThan(0);
            expect(isValidIso8601(record.timestamp)).toBe(true);
            expect(typeof record.exit_code).toBe("number");
            expect(Number.isInteger(record.exit_code)).toBe(true);
            expect(record.duration_ms).toBeGreaterThanOrEqual(0);
            expect(typeof record.workflow_state_id).toBe("string");
            expect(record.workflow_state_id.length).toBeGreaterThan(0);
        }), { numRuns: NUM_RUNS });
    });
    it("dispatch() includes trace_id in record when context has traceId", async () => {
        await fc.assert(fc.asyncProperty(fc.record({
            subcommand: fc.constantFrom("review", "decide", "learn"),
            mode: fc.constantFrom("interactive", "loop"),
            trace_id: fc.stringMatching(/^trace_\d{8}T\d{4}_[0-9a-f]{6}$/),
        }), async ({ subcommand, mode, trace_id }) => {
            delete process.env.CLAUDE_CODE_WORKFLOWS;
            const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const ctx = makeCtx({ subcommand, mode, runId, traceId: trace_id });
            const result = await dispatch(ctx, {
                runFallback: async () => ({ output: "fb", methodology: "subagent-parallel" }),
            });
            expect(result.record.trace_id).toBe(trace_id);
        }), { numRuns: 50 });
    });
    it("dispatch() record is valid without trace_id when context has empty traceId", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const ctx = makeCtx({ runId, traceId: "" });
        const result = await dispatch(ctx, {
            runFallback: async () => ({ output: "fb", methodology: "subagent-parallel" }),
        });
        expect(result.record.trace_id).toBeUndefined();
        for (const field of REQUIRED_FIELDS) {
            expect(result.record).toHaveProperty(field);
        }
    });
});
//# sourceMappingURL=dispatch-jsonl-schema.property.test.js.map