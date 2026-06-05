/**
 * Tests for trace-id generation and validation.
 *
 * Validates: Phase 3 Tracing — cross-phase correlation ID.
 * Format: trace_<YYYYMMDDTHHmm>_<4-char-hex>
 */
import { describe, expect, it } from "vitest";
import { generateTraceId, isValidTraceId, TRACE_ID_PATTERN } from "../src/trace-id.js";
describe("generateTraceId", () => {
    it("produces a string matching trace_<YYYYMMDDTHHmm>_<hex6>", () => {
        const id = generateTraceId();
        expect(TRACE_ID_PATTERN.test(id)).toBe(true);
    });
    it("timestamp portion is within 1 minute of current time", () => {
        const before = new Date();
        const id = generateTraceId();
        const after = new Date();
        // Extract timestamp from trace_<YYYYMMDDTHHmm>_xxxxxx
        const tsMatch = id.match(/^trace_(\d{8}T\d{4})_[0-9a-f]{6}$/);
        expect(tsMatch).not.toBeNull();
        const tsStr = tsMatch[1]; // e.g. "20260606T1437"
        const traceDate = new Date(Number(tsStr.slice(0, 4)), Number(tsStr.slice(4, 6)) - 1, Number(tsStr.slice(6, 8)), Number(tsStr.slice(9, 11)), Number(tsStr.slice(11, 13)));
        // trace timestamp should be within ±1 minute of surrounding time (local)
        const beforeMinus60 = new Date(before.getTime() - 60_000);
        const afterPlus60 = new Date(after.getTime() + 60_000);
        expect(traceDate.getTime()).toBeGreaterThanOrEqual(beforeMinus60.getTime());
        expect(traceDate.getTime()).toBeLessThanOrEqual(afterPlus60.getTime());
    });
    it("hex suffix uses only [0-9a-f] characters", () => {
        const ids = Array.from({ length: 100 }, () => generateTraceId());
        for (const id of ids) {
            const hexMatch = id.match(/_([0-9a-f]{6})$/);
            expect(hexMatch).not.toBeNull();
        }
    });
    it("produces unique IDs across 1000 rapid calls", () => {
        const ids = new Set();
        for (let i = 0; i < 1000; i++) {
            ids.add(generateTraceId());
        }
        expect(ids.size).toBe(1000);
    });
});
describe("isValidTraceId", () => {
    it("accepts valid trace IDs", () => {
        expect(isValidTraceId("trace_20260606T1437_a3f100")).toBe(true);
        expect(isValidTraceId("trace_20250101T0000_000000")).toBe(true);
        expect(isValidTraceId("trace_20261231T2359_ffffff")).toBe(true);
    });
    it("rejects non-string input", () => {
        expect(isValidTraceId(null)).toBe(false);
        expect(isValidTraceId(undefined)).toBe(false);
        expect(isValidTraceId(123)).toBe(false);
        expect(isValidTraceId({})).toBe(false);
    });
    it("rejects empty string", () => {
        expect(isValidTraceId("")).toBe(false);
    });
    it("rejects wrong prefix", () => {
        expect(isValidTraceId("sess_20260606T1437_a3f100")).toBe(false);
        expect(isValidTraceId("run_20260606T1437_a3f100")).toBe(false);
    });
    it("rejects malformed timestamp — wrong digit count", () => {
        expect(isValidTraceId("trace_2026060_T000_a3f100")).toBe(false); // 7 + 3 digits
        expect(isValidTraceId("trace_20260606T143_a3f100")).toBe(false); // 3-minute digits
        expect(isValidTraceId("trace_202606061437_a3f100")).toBe(false); // missing T
    });
    it("rejects hex suffix with wrong length or uppercase", () => {
        expect(isValidTraceId("trace_20260606T1437_a3f10")).toBe(false); // 5 chars
        expect(isValidTraceId("trace_20260606T1437_a3f1001")).toBe(false); // 7 chars
        expect(isValidTraceId("trace_20260606T1437_A3F100")).toBe(false); // uppercase
    });
});
describe("TRACE_ID_PATTERN", () => {
    it("matches valid trace IDs", () => {
        expect(TRACE_ID_PATTERN.test("trace_20260606T1437_abcdef")).toBe(true);
    });
    it("does not match non-trace strings", () => {
        expect(TRACE_ID_PATTERN.test("not-a-trace-id")).toBe(false);
        expect(TRACE_ID_PATTERN.test("")).toBe(false);
    });
});
//# sourceMappingURL=trace-id.test.js.map