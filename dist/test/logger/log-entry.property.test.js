import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
const LOG_LEVELS = ["debug", "info", "warn", "error"];
const logLevelArb = fc.constantFrom(...LOG_LEVELS);
const logEntryArb = fc.record({
    timestamp: fc.string({ minLength: 1 }),
    level: logLevelArb,
    event: fc.string({ minLength: 1, maxLength: 50 }),
    message: fc.string({ minLength: 1, maxLength: 200 }),
    runId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    iteration: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
    phase: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    branchName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    commitCount: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    metadata: fc.option(fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue()), {
        nil: undefined,
    }),
});
describe("Property 1: LogEntry JSON round-trip", () => {
    it("should produce deeply equal object after JSON parse/stringify", async () => {
        const { formatAsJson } = await import("../../src/logger/log-sink.js");
        fc.assert(fc.property(logEntryArb, (entry) => {
            const json = formatAsJson(entry);
            const parsed = JSON.parse(json);
            expect(parsed).toEqual(JSON.parse(JSON.stringify(entry)));
        }), { numRuns: 50 });
    });
});
/**
 * Feature: observability-enhancements, Property 1: LogEntry JSON 往返一致性
 * Validates: Requirements 1.7, 7.1, 7.4
 *
 * Generate LogEntry objects with new metadata types (SubagentTiming, DegradationResult)
 * and assert JSON.parse(formatAsJson(entry)) deep equals original object.
 */
const subagentTimingMetadataArb = fc.record({
    subagentId: fc.string({ minLength: 1, maxLength: 30 }),
    startMs: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    endMs: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    durationMs: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
});
const degradationResultMetadataArb = fc.record({
    isDegraded: fc.boolean(),
    currentMs: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    rollingAvgMs: fc.double({ min: 0, max: 1e12, noNaN: true, noDefaultInfinity: true }),
    deviationFactor: fc.double({ min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true }),
});
const metadataWithNewTypesArb = fc.oneof(subagentTimingMetadataArb.map((st) => st), degradationResultMetadataArb.map((dr) => dr), fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue()));
const logEntryWithNewMetadataArb = fc.record({
    timestamp: fc.string({ minLength: 1 }),
    level: logLevelArb,
    event: fc.string({ minLength: 1, maxLength: 50 }),
    message: fc.string({ minLength: 1, maxLength: 200 }),
    runId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    iteration: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
    phase: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    branchName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    commitCount: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    metadata: fc.option(metadataWithNewTypesArb, { nil: undefined }),
});
describe("Feature: observability-enhancements, Property 1: LogEntry JSON round-trip with new metadata types", () => {
    it("should produce deeply equal object after JSON round-trip for LogEntry with SubagentTiming metadata", async () => {
        const { formatAsJson } = await import("../../src/logger/log-sink.js");
        fc.assert(fc.property(fc.record({
            timestamp: fc.string({ minLength: 1 }),
            level: logLevelArb,
            event: fc.string({ minLength: 1, maxLength: 50 }),
            message: fc.string({ minLength: 1, maxLength: 200 }),
            metadata: subagentTimingMetadataArb.map((st) => st),
        }), (entry) => {
            const json = formatAsJson(entry);
            const parsed = JSON.parse(json);
            expect(parsed).toEqual(JSON.parse(JSON.stringify(entry)));
        }), { numRuns: 40 });
    });
    it("should produce deeply equal object after JSON round-trip for LogEntry with DegradationResult metadata", async () => {
        const { formatAsJson } = await import("../../src/logger/log-sink.js");
        fc.assert(fc.property(fc.record({
            timestamp: fc.string({ minLength: 1 }),
            level: logLevelArb,
            event: fc.string({ minLength: 1, maxLength: 50 }),
            message: fc.string({ minLength: 1, maxLength: 200 }),
            metadata: degradationResultMetadataArb.map((dr) => dr),
        }), (entry) => {
            const json = formatAsJson(entry);
            const parsed = JSON.parse(json);
            expect(parsed).toEqual(JSON.parse(JSON.stringify(entry)));
        }), { numRuns: 40 });
    });
    it("should produce deeply equal object after JSON round-trip for LogEntry with mixed metadata types", async () => {
        const { formatAsJson } = await import("../../src/logger/log-sink.js");
        fc.assert(fc.property(logEntryWithNewMetadataArb, (entry) => {
            const json = formatAsJson(entry);
            const parsed = JSON.parse(json);
            expect(parsed).toEqual(JSON.parse(JSON.stringify(entry)));
        }), { numRuns: 40 });
    });
});
//# sourceMappingURL=log-entry.property.test.js.map