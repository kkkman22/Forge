import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { safeParseReviewReport } from "../../src/schemas/review-report.js";
import { parseReviewReportGraceful } from "../../src/state.js";

const VALID_METHODOLOGIES = [
  "saved-workflow",
  "subagent-parallel",
  "subagent-serial",
  "ci-evidence",
  "unavailable",
] as const;

function withZodParser<T>(fn: () => T): T {
  const prev = process.env.FORGE_USE_ZOD_PARSER;
  process.env.FORGE_USE_ZOD_PARSER = "1";
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      process.env.FORGE_USE_ZOD_PARSER = undefined;
    } else {
      process.env.FORGE_USE_ZOD_PARSER = prev;
    }
  }
}

describe("methodology parsing invariants (property tests)", () => {
  afterEach(() => {
    process.env.FORGE_USE_ZOD_PARSER = undefined;
  });

  it("parser always returns valid methodology enum value", () => {
    const methodologyArb = fc.oneof(
      fc.constantFrom(...VALID_METHODOLOGIES),
      fc.string(),
      fc.constant(undefined),
      fc.constant(null),
      fc.integer(),
    );

    fc.assert(
      fc.property(methodologyArb, (methodology) => {
        const raw = { result: "pass", methodology };
        const { value } = safeParseReviewReport(raw);
        expect(VALID_METHODOLOGIES).toContain(value.methodology);
      }),
      { numRuns: 200 },
    );
  });

  it("unavailable invariant: methodology=unavailable forces result=blocked", () => {
    const resultArb = fc.oneof(
      fc.constantFrom("pass", "fail", "incomplete"),
      fc.string({ maxLength: 20 }),
      fc.constant(undefined),
      fc.constant(null),
    );

    fc.assert(
      fc.property(resultArb, (result) => {
        const raw = { methodology: "unavailable", result };
        const { value } = safeParseReviewReport(raw);
        expect(value.result).toBe("blocked");
      }),
      { numRuns: 200 },
    );
  });

  it("legacy and zod paths agree on methodology", () => {
    const contentArb = fc.oneof(
      // Empty/no frontmatter
      fc.constant(""),
      fc.constant("no frontmatter"),
      // Valid methodology
      ...VALID_METHODOLOGIES.map((m) =>
        fc.constant(
          [
            "---",
            `result: pass`,
            `methodology: ${m}`,
            "p0_count: 0",
            "p1_count: 0",
            "p2_count: 0",
            "p3_count: 0",
            "---",
            "",
          ].join("\n"),
        ),
      ),
      // Invalid methodology (random string)
      fc
        .string({ minLength: 1, maxLength: 20 })
        .map((s) =>
          [
            "---",
            "result: pass",
            `methodology: ${s}`,
            "p0_count: 0",
            "p1_count: 0",
            "p2_count: 0",
            "p3_count: 0",
            "---",
            "",
          ].join("\n"),
        ),
      // No methodology field
      fc.constant(
        [
          "---",
          "result: pass",
          "p0_count: 0",
          "p1_count: 0",
          "p2_count: 0",
          "p3_count: 0",
          "---",
          "",
        ].join("\n"),
      ),
    );

    fc.assert(
      fc.property(contentArb, (content) => {
        const legacy = parseReviewReportGraceful(content);
        const zod = withZodParser(() => parseReviewReportGraceful(content));
        expect(zod.parsed.methodology).toBe(legacy.parsed.methodology);
      }),
      { numRuns: 200 },
    );
  });
});
