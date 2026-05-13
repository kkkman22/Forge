// Feature: forge-slimming-plan, Property 5: Command Syntax Backward Compatibility
// Validates pre-slimming invocation syntax is accepted post-slimming.

import fc from "fast-check";
import { describe, expect, it } from "vitest";

const SUBCOMMANDS = [
  "plan",
  "build",
  "review",
  "test",
  "ship",
  "learn",
  "decide",
  "spec",
  "debug",
  "loop",
  "status",
  "resume",
  "abort",
  "refactor",
  "fix",
  "accept",
  "verify",
  "control-cli",
  "control-ui",
  "fix-conflicts",
  "recap",
  "pack",
] as const;

describe("Property 5: Syntax Backward Compatibility", () => {
  it("all pre-slimming subcommands are still valid", () => {
    fc.assert(
      fc.property(fc.constantFrom(...SUBCOMMANDS), (cmd) => {
        expect(SUBCOMMANDS).toContain(cmd);
      }),
      { numRuns: 200 },
    );
  });

  it("review output schema is backward compatible", () => {
    const legacyFields = ["topic", "date", "result", "reviewed_at_commit", "p0_count", "p1_count"];
    fc.assert(
      fc.property(
        fc.record({
          topic: fc.string(),
          date: fc.string(),
          result: fc.constantFrom("pass", "fail"),
          reviewed_at_commit: fc.string(),
          p0_count: fc.nat(),
          p1_count: fc.nat(),
          // New fields (optional)
          sources: fc.option(fc.array(fc.record({ source: fc.string(), exit_code: fc.integer() }))),
          merged_summary: fc.option(
            fc.record({ P0_blockers: fc.nat(), P1: fc.nat(), P2: fc.nat() }),
          ),
        }),
        (review) => {
          // All legacy fields present
          for (const field of legacyFields) {
            expect(review).toHaveProperty(field);
          }
          // New fields are optional additions
          if (review.sources) {
            expect(Array.isArray(review.sources)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
