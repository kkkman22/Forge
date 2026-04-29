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
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=log-entry.property.test.js.map