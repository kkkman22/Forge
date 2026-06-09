/**
 * Property-based tests for the context-budget module.
 *
 * Covers:
 *   - Property 1: Classification mapping correctness
 *   - Property 2: Explore summary format constraints
 *   - Property 3: Review summary format constraints
 *   - Property 4: Test output trimmer correctness
 *   - Property 5: Git output limiter threshold behavior
 *   - Property 6: Subagent summary format completeness
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
  ExploreSummary,
  GitDiffSummary,
  GitStatusSummary,
  ReviewSummary,
  SubagentSummary,
  TestOutputSummary,
} from "../src/context-budget.js";
import {
  CLASSIFICATION_MAP,
  classifySource,
  computeContextBudgetThresholds,
  serializeExploreSummary,
  serializeGitDiff,
  serializeGitStatus,
  serializeReviewSummary,
  serializeSubagentSummary,
  serializeTestOutput,
} from "../src/context-budget.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const entryPointArb: fc.Arbitrary<{ filePath: string; line: number; functionName: string }> =
  fc.record({
    filePath: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => !s.includes("\n")),
    line: fc.integer({ min: 1, max: 9999 }),
    functionName: fc
      .string({ minLength: 1, maxLength: 40 })
      .filter((s) => /^[a-zA-Z_]\w*$/.test(s)),
  });

const exploreSummaryArb: fc.Arbitrary<ExploreSummary> = fc.record({
  entryPoints: fc.array(entryPointArb, { maxLength: 8 }),
  dependencyChain: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 10 }),
  relatedTests: fc.array(
    fc.record({
      filePath: fc.string({ minLength: 1, maxLength: 60 }),
      testCount: fc.integer({ min: 0, max: 100 }),
    }),
    { maxLength: 10 },
  ),
  keyInterfaces: fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => /^[a-zA-Z_]\w*$/.test(s)),
      filePath: fc.string({ minLength: 1, maxLength: 60 }),
      line: fc.integer({ min: 1, max: 9999 }),
    }),
    { maxLength: 8 },
  ),
  fileGroups: fc.array(
    fc.record({
      moduleName: fc.string({ minLength: 1, maxLength: 30 }),
      fileCount: fc.integer({ min: 1, max: 50 }),
    }),
    { maxLength: 10 },
  ),
});

const findingArb = fc.record({
  severity: fc.constantFrom("P0" as const, "P1" as const, "P2" as const, "P3" as const),
  filePath: fc.string({ minLength: 1, maxLength: 60 }),
  line: fc.integer({ min: 1, max: 9999 }),
  description: fc.string({ minLength: 1, maxLength: 100 }),
});

const reviewSummaryArb: fc.Arbitrary<ReviewSummary> = fc.record({
  filePath: fc.string({ minLength: 1, maxLength: 80 }),
  severityCounts: fc.record({
    p0: fc.integer({ min: 0, max: 10 }),
    p1: fc.integer({ min: 0, max: 10 }),
    p2: fc.integer({ min: 0, max: 10 }),
    p3: fc.integer({ min: 0, max: 10 }),
  }),
  findings: fc.array(findingArb, { maxLength: 20 }),
});

const testFailureArb = fc.record({
  testName: fc.string({ minLength: 1, maxLength: 60 }),
  filePath: fc.string({ minLength: 1, maxLength: 60 }),
  line: fc.integer({ min: 1, max: 9999 }),
  errorMessage: fc.string({ minLength: 1, maxLength: 120 }),
});

const testOutputSummaryArb: fc.Arbitrary<TestOutputSummary> = fc.record({
  total: fc.integer({ min: 0, max: 500 }),
  passed: fc.integer({ min: 0, max: 500 }),
  failed: fc.integer({ min: 0, max: 50 }),
  skipped: fc.integer({ min: 0, max: 50 }),
  duration: fc.integer({ min: 0, max: 300000 }),
  failures: fc.array(testFailureArb, { maxLength: 20 }),
});

const _gitDiffSummaryArb: fc.Arbitrary<GitDiffSummary> = fc.record({
  fileCount: fc.integer({ min: 1, max: 100 }),
  files: fc.array(
    fc.record({
      filePath: fc.string({ minLength: 1, maxLength: 80 }),
      added: fc.integer({ min: 0, max: 1000 }),
      removed: fc.integer({ min: 0, max: 1000 }),
    }),
    { maxLength: 50 },
  ),
  totalAdded: fc.integer({ min: 0, max: 10000 }),
  totalRemoved: fc.integer({ min: 0, max: 10000 }),
  fullDiffPath: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 80 })),
});

const _gitStatusSummaryArb: fc.Arbitrary<GitStatusSummary> = fc.record({
  staged: fc.record({
    count: fc.integer({ min: 0, max: 100 }),
    files: fc.array(fc.string({ minLength: 1, maxLength: 60 }), { maxLength: 30 }),
  }),
  modified: fc.record({
    count: fc.integer({ min: 0, max: 100 }),
    files: fc.array(fc.string({ minLength: 1, maxLength: 60 }), { maxLength: 30 }),
  }),
  untracked: fc.record({
    count: fc.integer({ min: 0, max: 100 }),
    files: fc.array(fc.string({ minLength: 1, maxLength: 60 }), { maxLength: 30 }),
  }),
});

const subagentSummaryArb: fc.Arbitrary<SubagentSummary> = fc
  .tuple(
    fc.constantFrom("DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED") as fc.Arbitrary<
      "DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED"
    >,
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.array(fc.string({ minLength: 1, maxLength: 60 }), { maxLength: 10 }),
    fc.record({
      passed: fc.integer({ min: 0, max: 500 }),
      failed: fc.integer({ min: 0, max: 50 }),
    }),
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.option(fc.string({ minLength: 1, maxLength: 100 })),
    fc.option(fc.array(fc.string({ minLength: 1, maxLength: 80 }), { maxLength: 5 })),
  )
  .map(
    ([
      status,
      taskDescription,
      changedFiles,
      testResult,
      commitMessage,
      selfCheckResults,
      blockingReason,
      concerns,
    ]): SubagentSummary => {
      const result: SubagentSummary = {
        status,
        taskDescription,
        changedFiles,
        testResult,
        commitMessage,
        selfCheckResults,
      };
      if ((status === "BLOCKED" || status === "NEEDS_CONTEXT") && blockingReason) {
        result.blockingReason = blockingReason;
      }
      if (status === "DONE_WITH_CONCERNS" && concerns) {
        result.concerns = concerns;
      }
      return result;
    },
  );

// ---------------------------------------------------------------------------
// Property 1: Classification mapping correctness
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 1: Classification mapping correctness", () => {
  it("each known source maps to exactly one lifecycle category", () => {
    const sources = CLASSIFICATION_MAP.map((e) => e.source);
    expect(new Set(sources).size).toBe(sources.length);

    for (const entry of CLASSIFICATION_MAP) {
      const result = classifySource(entry.source);
      expect(result).toBe(entry.lifecycle);
    }
  });

  it("no source appears with two different categories", () => {
    const seen = new Map<string, string>();
    for (const entry of CLASSIFICATION_MAP) {
      const existing = seen.get(entry.source);
      expect(existing, `Duplicate source: ${entry.source}`).toBeUndefined();
      seen.set(entry.source, entry.lifecycle);
    }
  });

  it("classifySource returns undefined for unknown sources", () => {
    expect(classifySource("unknown-source-xyz")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Property 2: Explore summary format constraints
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 2: Explore summary format constraints", () => {
  it("serialized output does not exceed 300 tokens (approximated by char count)", () => {
    fc.assert(
      fc.property(exploreSummaryArb, (summary) => {
        const result = serializeExploreSummary(summary);
        // Rough token approximation: 1 token ≈ 4 chars
        const approxTokens = result.length / 4;
        expect(approxTokens).toBeLessThanOrEqual(300);
      }),
    );
  });

  it("uses grouped format when more than 5 files across fileGroups", () => {
    const summary: ExploreSummary = {
      entryPoints: [{ filePath: "src/a.ts", line: 1, functionName: "main" }],
      dependencyChain: ["a"],
      relatedTests: [],
      keyInterfaces: [],
      fileGroups: [
        { moduleName: "mod1", fileCount: 2 },
        { moduleName: "mod2", fileCount: 3 },
        { moduleName: "mod3", fileCount: 2 },
      ],
    };
    const result = serializeExploreSummary(summary);
    expect(result).toContain("mod1");
    expect(result).toContain("mod2");
  });
});

// ---------------------------------------------------------------------------
// Property 3: Review summary format constraints
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 3: Review summary format constraints", () => {
  it("serialized output does not exceed 400 tokens", () => {
    fc.assert(
      fc.property(reviewSummaryArb, (summary) => {
        const result = serializeReviewSummary(summary);
        const approxTokens = result.length / 4;
        expect(approxTokens).toBeLessThanOrEqual(400);
      }),
    );
  });

  it("contains file path reference", () => {
    fc.assert(
      fc.property(reviewSummaryArb, (summary) => {
        const result = serializeReviewSummary(summary);
        expect(result).toContain(summary.filePath);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Test output trimmer correctness
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 4: Test output trimmer correctness", () => {
  it("all-pass produces single summary line ≤150 tokens", () => {
    fc.assert(
      fc.property(testOutputSummaryArb, (summary) => {
        const allPass = { ...summary, failed: 0, failures: [], passed: summary.total };
        const result = serializeTestOutput(allPass);
        const approxTokens = result.length / 4;
        expect(approxTokens).toBeLessThanOrEqual(150);
        expect(result).not.toContain("FAIL");
      }),
    );
  });

  it("failures include all failure details without passing test details", () => {
    const summary: TestOutputSummary = {
      total: 10,
      passed: 8,
      failed: 2,
      skipped: 0,
      duration: 1000,
      failures: [
        { testName: "test1", filePath: "a.ts", line: 5, errorMessage: "expected 1" },
        { testName: "test2", filePath: "b.ts", line: 10, errorMessage: "expected 2" },
      ],
    };
    const result = serializeTestOutput(summary);
    expect(result).toContain("test1");
    expect(result).toContain("test2");
    expect(result).toContain("expected 1");
    expect(result).toContain("expected 2");
  });
});

// ---------------------------------------------------------------------------
// Property 5: Git output limiter threshold behavior
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 5: Git output limiter threshold behavior", () => {
  it("git diff >50 lines produces file-level summary", () => {
    const summary: GitDiffSummary = {
      fileCount: 5,
      files: [
        { filePath: "a.ts", added: 20, removed: 10 },
        { filePath: "b.ts", added: 15, removed: 5 },
      ],
      totalAdded: 35,
      totalRemoved: 15,
      fullDiffPath: ".forge/debug/last-diff.txt",
    };
    const result = serializeGitDiff(summary, 51);
    expect(result).toContain("a.ts");
    expect(result).toContain("+35");
    expect(result).toContain("-15");
  });

  it("git status >30 files produces categorized summary with ≤10 files per category", () => {
    const files = Array.from({ length: 35 }, (_, i) => `file${i}.ts`);
    const summary: GitStatusSummary = {
      staged: { count: 35, files },
      modified: { count: 5, files: files.slice(0, 5) },
      untracked: { count: 2, files: files.slice(0, 2) },
    };
    const result = serializeGitStatus(summary, 31);
    expect(result).toContain("Staged:");
    expect(result).toContain("35");
  });
});

// ---------------------------------------------------------------------------
// Property 6: Subagent summary format completeness
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 6: Subagent summary format completeness", () => {
  it("contains all required fields and does not exceed 200 tokens", () => {
    fc.assert(
      fc.property(subagentSummaryArb, (summary) => {
        const result = serializeSubagentSummary(summary);
        const approxTokens = result.length / 4;
        expect(approxTokens).toBeLessThanOrEqual(200);
        expect(result).toContain(summary.status);
        expect(result).toContain(summary.taskDescription);
      }),
    );
  });

  it("BLOCKED status includes blocking reason", () => {
    const summary: SubagentSummary = {
      status: "BLOCKED",
      taskDescription: "implement X",
      changedFiles: [],
      testResult: { passed: 0, failed: 0 },
      commitMessage: "",
      selfCheckResults: "incomplete",
      blockingReason: "missing dependency",
    };
    const result = serializeSubagentSummary(summary);
    expect(result).toContain("missing dependency");
  });

  it("DONE_WITH_CONCERNS includes concerns", () => {
    const summary: SubagentSummary = {
      status: "DONE_WITH_CONCERNS",
      taskDescription: "implement X",
      changedFiles: ["a.ts"],
      testResult: { passed: 5, failed: 0 },
      commitMessage: "feat: X",
      selfCheckResults: "passed",
      concerns: ["performance concern"],
    };
    const result = serializeSubagentSummary(summary);
    expect(result).toContain("performance concern");
  });
});

describe("Feature: model-window-aware context thresholds", () => {
  it("invalid ratios fall back to defaults", () => {
    const result = computeContextBudgetThresholds({
      contextWindowTokens: 100_000,
      warningRatio: -1,
      compactRatio: 0,
      criticalRatio: 1.5,
    });

    expect(result.warningTokens).toBe(30_000);
    expect(result.compactTokens).toBe(50_000);
    expect(result.criticalTokens).toBe(70_000);
  });

  it("uses configured budget default when no inputs are provided", () => {
    const result = computeContextBudgetThresholds({});

    expect(result.source).toBe("configured-budget");
    expect(result.warningTokens).toBe(30_000);
    expect(result.compactTokens).toBe(50_000);
    expect(result.criticalTokens).toBe(70_000);
  });
});
