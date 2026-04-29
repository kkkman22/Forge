import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { LogEntry, LogLevel } from "../../src/logger/types.js";

const LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

const logLevelArb = fc.constantFrom(...LOG_LEVELS);

describe("Property 2: Log level filtering monotonicity", () => {
  it("should satisfy monotonicity: if lower severity passes, higher also passes", async () => {
    const { shouldLog } = await import("../../src/logger/log-sink.js");

    const LEVEL_ORDER: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    fc.assert(
      fc.property(logLevelArb, logLevelArb, (entryLevel, configLevel) => {
        // For every level B with higher severity than entryLevel,
        // if entryLevel passes, B should also pass
        for (const level of LOG_LEVELS) {
          if (LEVEL_ORDER[level] >= LEVEL_ORDER[entryLevel]) {
            if (shouldLog(entryLevel, configLevel)) {
              expect(shouldLog(level, configLevel)).toBe(true);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("Property 5: Text format backward compatibility", () => {
  it("should produce non-empty string without JSON object delimiter at start", async () => {
    const { formatAsText } = await import("../../src/logger/log-sink.js");

    const logEntryArb: fc.Arbitrary<LogEntry> = fc.record({
      timestamp: fc.string({ minLength: 1 }),
      level: fc.constantFrom(...LOG_LEVELS),
      event: fc.string({ minLength: 1, maxLength: 50 }),
      message: fc.string({ minLength: 1, maxLength: 200 }),
      runId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      iteration: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
      phase: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
      branchName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      commitCount: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
      metadata: fc.option(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.jsonValue()),
        { nil: undefined },
      ),
    });

    fc.assert(
      fc.property(logEntryArb, (entry) => {
        const text = formatAsText(entry);
        expect(text.length).toBeGreaterThan(0);
        expect(text.startsWith("{")).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});
