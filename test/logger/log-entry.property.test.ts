import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

const logLevelArb = fc.constantFrom(...LOG_LEVELS);

const logEntryArb: fc.Arbitrary<{
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  message: string;
  runId?: string;
  iteration?: number;
  phase?: string;
  branchName?: string;
  commitCount?: number;
  metadata?: Record<string, unknown>;
}> = fc
  .record({
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
  })
  .map((entry) => {
    const result: Record<string, unknown> = { ...entry };
    for (const key of Object.keys(result)) {
      if (result[key] === undefined) {
        delete result[key];
      }
    }
    return entry as typeof entry;
  });

describe("Property 1: LogEntry JSON round-trip", () => {
  it("should produce deeply equal object after JSON parse/stringify", async () => {
    const { formatAsJson } = await import("../../src/logger/log-sink.js");

    fc.assert(
      fc.property(logEntryArb, (entry) => {
        const json = formatAsJson(entry);
        const parsed = JSON.parse(json);
        expect(parsed).toEqual(entry);
      }),
      { numRuns: 200 },
    );
  });
});
