/**
 * Property-based tests for the second batch of Zod schemas:
 * `ReviewReportSchema`, `PlanFileSchema`, `SpecFileSchema`.
 *
 * Covers:
 *   - Round-trip: parse ∘ serialize ≡ identity for known fields
 *   - Passthrough: unknown fields survive a well-formed input
 *   - Invalid values on known fields are dropped (not crashed)
 *
 * **Validates: Requirements 2.7, 2.8, 2.9**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  PlanFileSchema,
  ReviewReportSchema,
  SpecFileSchema,
  safeParsePlanFile,
  safeParseReviewReport,
  safeParseSpecFile,
} from "../src/schemas/index.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const reviewReportArb = fc.record(
  {
    result: fc.constantFrom("pass", "fail", "incomplete"),
    p0_count: fc.integer({ min: 0, max: 20 }),
    p1_count: fc.integer({ min: 0, max: 50 }),
    p2_count: fc.integer({ min: 0, max: 100 }),
    p3_count: fc.integer({ min: 0, max: 200 }),
    methodology: fc.constantFrom(
      "saved-workflow",
      "subagent-parallel",
      "subagent-serial",
      "ci-evidence",
      "unavailable",
    ),
  },
  { requiredKeys: [] },
);

const planFileArb = fc.record(
  {
    format: fc.constantFrom("full", "lightweight"),
    status: fc.constantFrom("draft", "approved", "rejected"),
    context_files: fc.array(fc.stringMatching(/^[a-z0-9./_-]{1,60}$/), { maxLength: 5 }),
    task: fc.string({ maxLength: 40 }),
    date: fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  },
  { requiredKeys: [] },
);

const specFileArb = fc.record(
  {
    feature: fc.stringMatching(/^[a-z][a-z0-9-]{1,40}$/),
    status: fc.constantFrom("draft", "locked"),
    date: fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    importSource: fc.stringMatching(/^\.forge\/inbox\/[a-z0-9.-]{1,40}\.md$/),
  },
  { requiredKeys: [] },
);

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe("review-report / plan-file / spec-file — round-trip", () => {
  /** **Validates: Requirement 2.9** */
  it("ReviewReportSchema round-trips any well-formed object", () => {
    fc.assert(
      fc.property(reviewReportArb, (sample) => {
        const wire = JSON.parse(JSON.stringify(sample));
        const { value, errors } = safeParseReviewReport(wire);
        // methodology=unavailable forces result=blocked → errors expected
        if (sample.methodology === "unavailable" && sample.result !== ("blocked" as string)) {
          expect(value.result).toBe("blocked");
          expect(errors.length).toBeGreaterThan(0);
        } else {
          expect(errors).toEqual([]);
          const expected = { ...sample, methodology: sample.methodology ?? "subagent-parallel" };
          expect(value).toEqual(expected);
        }
      }),
      { numRuns: 50 },
    );
  });

  /** **Validates: Requirement 2.9** */
  it("PlanFileSchema round-trips any well-formed object", () => {
    fc.assert(
      fc.property(planFileArb, (sample) => {
        const wire = JSON.parse(JSON.stringify(sample));
        const { value, errors } = safeParsePlanFile(wire);
        expect(errors).toEqual([]);
        expect(value).toEqual(sample);
      }),
      { numRuns: 50 },
    );
  });

  /** **Validates: Requirement 2.9** */
  it("SpecFileSchema round-trips any well-formed object", () => {
    fc.assert(
      fc.property(specFileArb, (sample) => {
        const wire = JSON.parse(JSON.stringify(sample));
        const { value, errors } = safeParseSpecFile(wire);
        expect(errors).toEqual([]);
        expect(value).toEqual(sample);
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Passthrough
// ---------------------------------------------------------------------------

describe("review-report / plan-file / spec-file — passthrough unknown fields", () => {
  const KNOWN_REVIEW = new Set(["result", "p0_count", "p1_count", "p2_count", "p3_count"]);
  const KNOWN_PLAN = new Set(["format", "status", "context_files", "task", "date"]);
  const KNOWN_SPEC = new Set(["feature", "status", "date", "importSource"]);

  /** **Validates: Requirement 2.7** */
  it("ReviewReportSchema preserves unknown fields", () => {
    fc.assert(
      fc.property(
        reviewReportArb,
        fc
          .stringMatching(/^[a-z_]{3,20}$/)
          .filter(
            (k) =>
              !KNOWN_REVIEW.has(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype",
          ),
        fc.string({ maxLength: 40 }),
        (sample, key, value) => {
          const augmented = { ...sample, [key]: value };
          const result = ReviewReportSchema.safeParse(augmented);
          expect(result.success).toBe(true);
          if (result.success) {
            expect((result.data as Record<string, unknown>)[key]).toBe(value);
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  /** **Validates: Requirement 2.7** */
  it("PlanFileSchema preserves unknown fields", () => {
    fc.assert(
      fc.property(
        planFileArb,
        fc
          .stringMatching(/^[a-z_]{3,20}$/)
          .filter(
            (k) =>
              !KNOWN_PLAN.has(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype",
          ),
        fc.string({ maxLength: 40 }),
        (sample, key, value) => {
          const augmented = { ...sample, [key]: value };
          const result = PlanFileSchema.safeParse(augmented);
          expect(result.success).toBe(true);
          if (result.success) {
            expect((result.data as Record<string, unknown>)[key]).toBe(value);
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  /** **Validates: Requirement 2.7** */
  it("SpecFileSchema preserves unknown fields", () => {
    fc.assert(
      fc.property(
        specFileArb,
        fc.stringMatching(/^[a-z_]{3,20}$/).filter((k) => !KNOWN_SPEC.has(k) && k !== "__proto__"),
        fc.string({ maxLength: 40 }),
        (sample, key, value) => {
          const augmented = { ...sample, [key]: value };
          const result = SpecFileSchema.safeParse(augmented);
          expect(result.success).toBe(true);
          if (result.success) {
            expect((result.data as Record<string, unknown>)[key]).toBe(value);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Invalid values are dropped by the safeParse wrappers
// ---------------------------------------------------------------------------

describe("safeParse* — lenient behaviour on invalid values", () => {
  /** **Validates: Requirement 2.8** */
  it("safeParseReviewReport drops invalid numeric fields", () => {
    const { value, errors } = safeParseReviewReport({
      result: "pass",
      p0_count: "not a number",
      p1_count: -1, // below min
      p2_count: 7,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(value.result).toBe("pass");
    expect(value.p2_count).toBe(7);
    expect(value.p0_count).toBeUndefined();
    expect(value.p1_count).toBeUndefined();
  });

  /** **Validates: Requirement 2.8** */
  it("safeParsePlanFile drops invalid enum values", () => {
    const { value, errors } = safeParsePlanFile({
      format: "bogus",
      status: "approved",
      context_files: ["a.md", "b.md"],
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(value.format).toBeUndefined();
    expect(value.status).toBe("approved");
    expect(value.context_files).toEqual(["a.md", "b.md"]);
  });

  /** **Validates: Requirement 2.8** */
  it("safeParseSpecFile drops invalid status and preserves valid fields", () => {
    const { value, errors } = safeParseSpecFile({
      feature: "my-feature",
      status: "unknown",
      date: "2026-05-06",
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(value.feature).toBe("my-feature");
    expect(value.status).toBeUndefined();
    expect(value.date).toBe("2026-05-06");
  });
});
