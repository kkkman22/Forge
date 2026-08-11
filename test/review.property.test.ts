/**
 * Property tests for the Review engine.
 *
 * Property 17: 置信度过滤正确性
 *   - confidence ≥ 0.8 → included
 *   - confidence 0.5–0.7 → lowConfidence
 *   - confidence < 0.5 → discarded
 *
 * Property 18: 去重合并正确性
 *   - Same file + close line + same description → merged
 *   - Merged finding keeps highest severity, highest confidence, most conservative fix route
 *
 * Property 19: 跨评审者一致性提升
 *   - 2+ reviewers → confidence += 0.10 (cap 1.0)
 *
 * Property 20: 报告质量门
 *   - 6 items must all pass for gate to pass
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyCrossValidation,
  CONFIDENCE_THRESHOLD,
  CROSS_VALIDATION_BOOST,
  deduplicateFindings,
  type FixRoute,
  filterByConfidence,
  LINE_TOLERANCE,
  LOW_CONFIDENCE_MIN,
  MAX_CONFIDENCE,
  type MergedFinding,
  type ReviewFinding,
  runReportQualityGate,
  type Severity,
} from "../src/review.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const severityArb: fc.Arbitrary<Severity> = fc.constantFrom("P0", "P1", "P2", "P3");
const fixRouteArb: fc.Arbitrary<FixRoute> = fc.constantFrom(
  "safe_auto",
  "gated_auto",
  "manual",
  "advisory",
);
const reviewerArb: fc.Arbitrary<string> = fc.constantFrom(
  "spec-check",
  "quality-check",
  "security-check",
);

const findingArb: fc.Arbitrary<ReviewFinding> = fc.record({
  severity: severityArb,
  confidence: fc.double({ min: 0.0, max: 1.0, noNaN: true }),
  fixRoute: fixRouteArb,
  filePath: fc.stringMatching(/^src\/[a-z]+\.[a-z]+$/),
  lineNumber: fc.integer({ min: 1, max: 1000 }),
  description: fc.stringMatching(/^[a-z ]{5,30}$/),
  suggestion: fc.stringMatching(/^[a-z ]{5,30}$/),
  reviewer: reviewerArb,
});

const findingsArrayArb: fc.Arbitrary<ReviewFinding[]> = fc.array(findingArb, {
  minLength: 0,
  maxLength: 20,
});

// ---------------------------------------------------------------------------
// Property 17: 置信度过滤正确性
// ---------------------------------------------------------------------------

describe("Property 17: 置信度过滤正确性", () => {
  it("findings with confidence ≥ 0.8 are included", () => {
    fc.assert(
      fc.property(findingsArrayArb, (findings) => {
        const result = filterByConfidence(findings);
        for (const f of result.included) {
          expect(f.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("findings with confidence 0.5–0.7 go to lowConfidence", () => {
    fc.assert(
      fc.property(findingsArrayArb, (findings) => {
        const result = filterByConfidence(findings);
        for (const f of result.lowConfidence) {
          expect(f.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE_MIN);
          expect(f.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("findings with confidence < 0.5 are discarded", () => {
    fc.assert(
      fc.property(findingsArrayArb, (findings) => {
        const result = filterByConfidence(findings);
        for (const f of result.discarded) {
          expect(f.confidence).toBeLessThan(LOW_CONFIDENCE_MIN);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("total count is preserved after filtering", () => {
    fc.assert(
      fc.property(findingsArrayArb, (findings) => {
        const result = filterByConfidence(findings);
        expect(result.included.length + result.lowConfidence.length + result.discarded.length).toBe(
          findings.length,
        );
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: 去重合并正确性
// ---------------------------------------------------------------------------

describe("Property 18: 去重合并正确性", () => {
  it("duplicate findings (same file, close line, same description) are merged", () => {
    fc.assert(
      fc.property(
        findingArb,
        fc.integer({ min: 0, max: LINE_TOLERANCE }),
        reviewerArb,
        (base, lineOffset, otherReviewer) => {
          const dup: ReviewFinding = {
            ...base,
            lineNumber: base.lineNumber + lineOffset,
            reviewer: otherReviewer,
          };
          const result = deduplicateFindings([base, dup]);
          // If same reviewer, still 1 merged finding; if different, also 1
          expect(result.length).toBe(1);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("findings with distant lines are NOT merged", () => {
    fc.assert(
      fc.property(
        findingArb,
        fc.integer({ min: LINE_TOLERANCE + 1, max: 500 }),
        (base, lineOffset) => {
          const distant: ReviewFinding = {
            ...base,
            lineNumber: base.lineNumber + lineOffset,
            reviewer: "quality-check",
          };
          // Ensure different reviewer to avoid same-object dedup
          const baseWithReviewer = { ...base, reviewer: "spec-check" };
          const result = deduplicateFindings([baseWithReviewer, distant]);
          expect(result.length).toBe(2);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("merged finding keeps highest severity", () => {
    const severityRank: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    fc.assert(
      fc.property(findingArb, severityArb, (base, otherSeverity) => {
        const dup: ReviewFinding = {
          ...base,
          severity: otherSeverity,
          reviewer: base.reviewer === "spec-check" ? "quality-check" : "spec-check",
        };
        const result = deduplicateFindings([base, dup]);
        expect(result.length).toBe(1);
        const expectedSeverity =
          severityRank[base.severity] <= severityRank[otherSeverity]
            ? base.severity
            : otherSeverity;
        expect(result[0].severity).toBe(expectedSeverity);
      }),
      { numRuns: 50 },
    );
  });

  it("merged finding keeps highest confidence", () => {
    fc.assert(
      fc.property(
        findingArb,
        fc.double({ min: 0.0, max: 1.0, noNaN: true }),
        (base, otherConfidence) => {
          const dup: ReviewFinding = {
            ...base,
            confidence: otherConfidence,
            reviewer: base.reviewer === "spec-check" ? "quality-check" : "spec-check",
          };
          const result = deduplicateFindings([base, dup]);
          expect(result.length).toBe(1);
          expect(result[0].confidence).toBe(Math.max(base.confidence, otherConfidence));
        },
      ),
      { numRuns: 50 },
    );
  });

  it("deduplication never increases total count", () => {
    fc.assert(
      fc.property(findingsArrayArb, (findings) => {
        const result = deduplicateFindings(findings);
        expect(result.length).toBeLessThanOrEqual(findings.length);
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 19: 跨评审者一致性提升
// ---------------------------------------------------------------------------

describe("Property 19: 跨评审者一致性提升", () => {
  it("findings with 2+ reviewers get confidence boost", () => {
    fc.assert(
      fc.property(findingArb, (base) => {
        const merged: MergedFinding = {
          ...base,
          reviewers: ["spec-check", "quality-check"],
          crossValidated: false,
        };
        const result = applyCrossValidation([merged]);
        expect(result[0].crossValidated).toBe(true);
        expect(result[0].confidence).toBe(
          Math.min(base.confidence + CROSS_VALIDATION_BOOST, MAX_CONFIDENCE),
        );
      }),
      { numRuns: 50 },
    );
  });

  it("findings with 1 reviewer do NOT get boost", () => {
    fc.assert(
      fc.property(findingArb, (base) => {
        const merged: MergedFinding = {
          ...base,
          reviewers: ["spec-check"],
          crossValidated: false,
        };
        const result = applyCrossValidation([merged]);
        expect(result[0].crossValidated).toBe(false);
        expect(result[0].confidence).toBe(base.confidence);
      }),
      { numRuns: 50 },
    );
  });

  it("confidence never exceeds 1.0 after boost", () => {
    fc.assert(
      fc.property(findingArb, (base) => {
        const merged: MergedFinding = {
          ...base,
          confidence: 0.95, // Close to max
          reviewers: ["spec-check", "quality-check", "security-check"],
          crossValidated: false,
        };
        const result = applyCrossValidation([merged]);
        expect(result[0].confidence).toBeLessThanOrEqual(MAX_CONFIDENCE);
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 20: 报告质量门
// ---------------------------------------------------------------------------

describe("Property 20: 报告质量门", () => {
  it("clean findings pass all 6 quality gate items", () => {
    const cleanFinding: MergedFinding = {
      severity: "P2",
      confidence: 0.9,
      fixRoute: "safe_auto",
      filePath: "src/utils.ts",
      lineNumber: 42,
      description: "duplicated date validation logic",
      suggestion: "extract into shared utility function",
      reviewer: "quality-check",
      reviewers: ["quality-check"],
      crossValidated: false,
    };
    const result = runReportQualityGate([cleanFinding]);
    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(6);
    expect(result.items.every((i) => i.passed)).toBe(true);
  });

  it("finding with empty suggestion fails actionability check", () => {
    const badFinding: MergedFinding = {
      severity: "P2",
      confidence: 0.9,
      fixRoute: "safe_auto",
      filePath: "src/utils.ts",
      lineNumber: 42,
      description: "some issue",
      suggestion: "",
      reviewer: "quality-check",
      reviewers: ["quality-check"],
      crossValidated: false,
    };
    const result = runReportQualityGate([badFinding]);
    expect(result.passed).toBe(false);
    expect(result.items.find((i) => i.name === "可操作性")?.passed).toBe(false);
  });

  it("P0 severity for style issue fails severity calibration", () => {
    const badFinding: MergedFinding = {
      severity: "P0",
      confidence: 0.9,
      fixRoute: "manual",
      filePath: "src/utils.ts",
      lineNumber: 42,
      description: "缩进不一致",
      suggestion: "fix indentation",
      reviewer: "quality-check",
      reviewers: ["quality-check"],
      crossValidated: false,
    };
    const result = runReportQualityGate([badFinding]);
    expect(result.passed).toBe(false);
    expect(result.items.find((i) => i.name === "严重度校准")?.passed).toBe(false);
  });

  it("finding with non-positive line number fails line accuracy check", () => {
    const badFinding: MergedFinding = {
      severity: "P2",
      confidence: 0.9,
      fixRoute: "safe_auto",
      filePath: "src/utils.ts",
      lineNumber: 0,
      description: "some issue",
      suggestion: "fix it",
      reviewer: "quality-check",
      reviewers: ["quality-check"],
      crossValidated: false,
    };
    const result = runReportQualityGate([badFinding]);
    expect(result.passed).toBe(false);
    expect(result.items.find((i) => i.name === "行号准确性")?.passed).toBe(false);
  });

  it("finding targeting .tinkerman/ file fails protected file check", () => {
    const badFinding: MergedFinding = {
      severity: "P3",
      confidence: 0.9,
      fixRoute: "advisory",
      filePath: ".tinkerman/status.md",
      lineNumber: 1,
      description: "unnecessary file",
      suggestion: "remove this file",
      reviewer: "quality-check",
      reviewers: ["quality-check"],
      crossValidated: false,
    };
    const result = runReportQualityGate([badFinding]);
    expect(result.passed).toBe(false);
    expect(result.items.find((i) => i.name === "受保护文件")?.passed).toBe(false);
  });

  it("empty findings array passes all gates", () => {
    const result = runReportQualityGate([]);
    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(6);
  });

  it("gate passes iff all 6 items pass", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }), (_itemResults) => {
        // We can't easily generate arbitrary findings that trigger specific gate items,
        // but we can verify the gate logic: passed === all items passed
        const result = runReportQualityGate([]);
        expect(result.passed).toBe(result.items.every((i) => i.passed));
      }),
      { numRuns: 50 },
    );
  });

  it("custom vaguePatterns override defaults", () => {
    const finding: MergedFinding = {
      severity: "P2",
      confidence: 0.9,
      fixRoute: "safe_auto",
      filePath: "src/utils.ts",
      lineNumber: 42,
      description: "duplicated logic",
      suggestion: "consider improving this module",
      reviewer: "quality-check",
      reviewers: ["quality-check"],
      crossValidated: false,
    };

    // Default patterns include "consider improving" — should fail
    const defaultResult = runReportQualityGate([finding]);
    expect(defaultResult.items.find((i) => i.name === "误报排除")?.passed).toBe(false);

    // Custom patterns without "consider improving" — should pass
    const customResult = runReportQualityGate([finding], { vaguePatterns: ["也许应该"] });
    expect(customResult.items.find((i) => i.name === "误报排除")?.passed).toBe(true);
  });

  it("custom styleKeywords override defaults", () => {
    const finding: MergedFinding = {
      severity: "P0",
      confidence: 0.9,
      fixRoute: "manual",
      filePath: "src/utils.ts",
      lineNumber: 42,
      description: "缩进不一致",
      suggestion: "fix indentation",
      reviewer: "quality-check",
      reviewers: ["quality-check"],
      crossValidated: false,
    };

    // Default style keywords include "缩进" — P0 for style should fail
    const defaultResult = runReportQualityGate([finding]);
    expect(defaultResult.items.find((i) => i.name === "严重度校准")?.passed).toBe(false);

    // Custom keywords without "缩进" — should pass
    const customResult = runReportQualityGate([finding], { styleKeywords: ["tab-width"] });
    expect(customResult.items.find((i) => i.name === "严重度校准")?.passed).toBe(true);
  });

  it("custom linterKeywords override defaults", () => {
    const finding: MergedFinding = {
      severity: "P2",
      confidence: 0.9,
      fixRoute: "safe_auto",
      filePath: "src/utils.ts",
      lineNumber: 42,
      description: "missing semicolon at end of statement",
      suggestion: "add semicolon",
      reviewer: "quality-check",
      reviewers: ["quality-check"],
      crossValidated: false,
    };

    // Default linter keywords include "missing semicolon" — should fail
    const defaultResult = runReportQualityGate([finding]);
    expect(defaultResult.items.find((i) => i.name === "不与 Linter 重复")?.passed).toBe(false);

    // Custom keywords without "missing semicolon" — should pass
    const customResult = runReportQualityGate([finding], { linterKeywords: ["trailing comma"] });
    expect(customResult.items.find((i) => i.name === "不与 Linter 重复")?.passed).toBe(true);
  });
});
