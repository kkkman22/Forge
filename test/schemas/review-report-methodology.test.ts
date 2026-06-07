import { describe, expect, it } from "vitest";
import {
  MethodologySchema,
  ReviewReportSchema,
  safeParseReviewReport,
} from "../../src/schemas/review-report.js";

describe("ReviewReportSchema — methodology field", () => {
  it("accepts all review methodology values", () => {
    for (const value of [
      "saved-workflow",
      "subagent-parallel",
      "subagent-serial",
      "ci-evidence",
      "unavailable",
    ]) {
      const result = ReviewReportSchema.safeParse({ methodology: value });
      expect(result.success, `methodology="${value}" should parse`).toBe(true);
      if (result.success) {
        expect(result.data.methodology).toBe(value);
      }
    }
  });

  it("rejects invalid methodology values", () => {
    for (const invalid of ["foo", "", null, 42, "SUBAGENT-PARALLEL"]) {
      const result = MethodologySchema.safeParse(invalid);
      expect(result.success, `methodology=${JSON.stringify(invalid)} should fail`).toBe(false);
    }
  });

  it("fills default subagent-parallel when methodology absent", () => {
    const { value, errors } = safeParseReviewReport({ result: "pass" });
    expect(value.methodology).toBe("subagent-parallel");
    expect(errors).toHaveLength(0);
  });

  it("degrades invalid methodology to default with errors[] entry", () => {
    const { value, errors } = safeParseReviewReport({ methodology: "foo" });
    expect(value.methodology).toBe("subagent-parallel");
    expect(errors.some((e) => e.includes("methodology field invalid"))).toBe(true);
  });

  it("unavailable forces result=blocked even when frontmatter says passed", () => {
    const { value, errors } = safeParseReviewReport({
      methodology: "unavailable",
      result: "pass",
    });
    expect(value.result).toBe("blocked");
    expect(value.methodology).toBe("unavailable");
    expect(errors.some((e) => e.includes("methodology=unavailable forces"))).toBe(true);
  });

  it("unavailable + result=blocked passes without forcing warning", () => {
    const { value, errors } = safeParseReviewReport({
      methodology: "unavailable",
      result: "blocked",
    });
    expect(value.result).toBe("blocked");
    expect(value.methodology).toBe("unavailable");
    expect(errors.some((e) => e.includes("methodology=unavailable forces"))).toBe(false);
  });
});
