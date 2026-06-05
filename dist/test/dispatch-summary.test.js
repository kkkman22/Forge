/**
 * Tests for dispatch record aggregation utilities.
 *
 * Validates: Phase 3 T5 — Metrics aggregation (summarizeDispatches).
 */
import { describe, expect, it } from "vitest";
import { frozenZoneRecord, summarizeDispatches } from "../src/dispatch-record.js";
function makeRecord(overrides = {}) {
    return {
        subcommand: "review",
        mode: "interactive",
        run_id: "run-1",
        session_id: "sess-1",
        workflow_state_id: "ws-1",
        workflow_version: "1.0",
        gate_enabled: true,
        workflow_available: true,
        chosen_level: "L0",
        exit_code: 0,
        duration_ms: 100,
        timestamp: "2026-06-06T00:00:00Z",
        frozen_zone_blocked: false,
        trace_id: "trace_20260606T1437_abcdef",
        ...overrides,
    };
}
describe("summarizeDispatches", () => {
    it("returns empty summary for empty array", () => {
        const summary = summarizeDispatches([]);
        expect(summary.total).toBe(0);
        expect(summary.avgDurationMs).toBe(0);
        expect(summary.errorRate).toBe(0);
        expect(summary.bySubcommand).toEqual({});
    });
    it("aggregates single record correctly", () => {
        const summary = summarizeDispatches([makeRecord({ duration_ms: 200 })]);
        expect(summary.total).toBe(1);
        expect(summary.avgDurationMs).toBe(200);
        expect(summary.errorRate).toBe(0);
        expect(summary.bySubcommand).toEqual({ review: 1 });
    });
    it("computes average duration across multiple records", () => {
        const records = [
            makeRecord({ duration_ms: 100 }),
            makeRecord({ duration_ms: 200 }),
            makeRecord({ duration_ms: 300 }),
        ];
        const summary = summarizeDispatches(records);
        expect(summary.total).toBe(3);
        expect(summary.avgDurationMs).toBe(200);
    });
    it("computes error rate from non-zero exit codes", () => {
        const records = [
            makeRecord({ exit_code: 0 }),
            makeRecord({ exit_code: 1 }),
            makeRecord({ exit_code: 0 }),
            makeRecord({ exit_code: 1 }),
        ];
        const summary = summarizeDispatches(records);
        expect(summary.errorRate).toBe(0.5);
    });
    it("groups by subcommand", () => {
        const records = [
            makeRecord({ subcommand: "review" }),
            makeRecord({ subcommand: "review" }),
            makeRecord({ subcommand: "decide" }),
        ];
        const summary = summarizeDispatches(records);
        expect(summary.bySubcommand).toEqual({ review: 2, decide: 1 });
    });
    it("ignores trace_id in aggregation", () => {
        const records = [
            makeRecord({ trace_id: "trace_20260606T1437_abc123" }),
            makeRecord({ trace_id: undefined }),
        ];
        const summary = summarizeDispatches(records);
        expect(summary.total).toBe(2);
    });
});
describe("frozenZoneRecord", () => {
    it("creates record without trace_id by default", () => {
        const record = frozenZoneRecord("review", "run-1");
        expect(record.frozen_zone_blocked).toBe(true);
        expect(record.trace_id).toBeUndefined();
    });
    it("includes trace_id when provided", () => {
        const record = frozenZoneRecord("review", "run-1", "sess-1", "trace_20260606T1437_abc123");
        expect(record.trace_id).toBe("trace_20260606T1437_abc123");
        expect(record.frozen_zone_blocked).toBe(true);
    });
});
//# sourceMappingURL=dispatch-summary.test.js.map