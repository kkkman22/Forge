/**
 * Round-trip property tests for the context-budget module.
 *
 * Covers:
 *   - Property 7: Subagent summary round-trip
 *   - Property 8: Explore summary round-trip
 *   - Property 9: Review summary round-trip
 *   - Property 10: Test output summary round-trip
 *   - Property 11: Git output summary round-trip
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
  deserializeExploreSummary,
  deserializeGitDiff,
  deserializeGitStatus,
  deserializeReviewSummary,
  deserializeSubagentSummary,
  deserializeTestOutput,
  serializeExploreSummary,
  serializeGitDiff,
  serializeGitStatus,
  serializeReviewSummary,
  serializeSubagentSummary,
  serializeTestOutput,
} from "../src/context-budget.js";

// ---------------------------------------------------------------------------
// Generators (reused from property tests)
// ---------------------------------------------------------------------------

/** String usable as a file path in serialized formats (non-empty, no format-breaking chars). */
const pathArb = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter(
    (s) =>
      s === s.trim() &&
      !s.includes("(") &&
      !s.includes(")") &&
      !s.includes("（") &&
      !s.includes("）") &&
      !s.includes(": +") &&
      !s.includes(": -") &&
      !s.includes(", ") &&
      !s.includes(": "),
  );

const entryPointArb: fc.Arbitrary<{ filePath: string; line: number; functionName: string }> =
  fc.record({
    filePath: pathArb,
    line: fc.integer({ min: 1, max: 9999 }),
    functionName: fc
      .string({ minLength: 1, maxLength: 40 })
      .filter((s) => /^[a-zA-Z_]\w*$/.test(s)),
  });

const exploreSummaryArb: fc.Arbitrary<ExploreSummary> = fc.record({
  entryPoints: fc.array(entryPointArb, { maxLength: 4 }),
  dependencyChain: fc.array(
    fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    { maxLength: 6 },
  ),
  relatedTests: fc.array(
    fc.record({
      filePath: pathArb,
      testCount: fc.integer({ min: 0, max: 100 }),
    }),
    { maxLength: 5 },
  ),
  keyInterfaces: fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => /^[a-zA-Z_]\w*$/.test(s)),
      filePath: pathArb,
      line: fc.integer({ min: 1, max: 9999 }),
    }),
    { maxLength: 4 },
  ),
  fileGroups: fc.array(
    fc.record({
      moduleName: fc
        .string({ minLength: 1, maxLength: 30 })
        .filter(
          (s) => s === s.trim() && !s.includes(", ") && !s.includes("（") && !s.includes("）"),
        ),
      fileCount: fc.integer({ min: 1, max: 50 }),
    }),
    { maxLength: 5 },
  ),
});

const reviewSummaryArb: fc.Arbitrary<ReviewSummary> = fc.record({
  filePath: pathArb,
  severityCounts: fc.record({
    p0: fc.integer({ min: 0, max: 10 }),
    p1: fc.integer({ min: 0, max: 10 }),
    p2: fc.integer({ min: 0, max: 10 }),
    p3: fc.integer({ min: 0, max: 10 }),
  }),
  findings: fc.array(
    fc.record({
      severity: fc.constantFrom("P0" as const, "P1" as const, "P2" as const, "P3" as const),
      filePath: pathArb,
      line: fc.integer({ min: 1, max: 9999 }),
      description: fc.string({ minLength: 1, maxLength: 100 }),
    }),
    { maxLength: 10 },
  ),
});

const testOutputSummaryArb: fc.Arbitrary<TestOutputSummary> = fc
  .record({
    passed: fc.integer({ min: 0, max: 500 }),
    failed: fc.integer({ min: 0, max: 50 }),
    skipped: fc.integer({ min: 0, max: 50 }),
    duration: fc.integer({ min: 0, max: 300000 }),
    failures: fc.array(
      fc.record({
        testName: fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
        filePath: pathArb,
        line: fc.integer({ min: 1, max: 9999 }),
        errorMessage: fc.string({ minLength: 1, maxLength: 120 }),
      }),
      { maxLength: 10 },
    ),
  })
  .map((base) => ({
    ...base,
    total: base.passed + base.failed + base.skipped,
    failures: base.failures.slice(0, base.failed),
    passed: base.passed,
    failed: base.failed,
  }));

const gitDiffSummaryArb: fc.Arbitrary<GitDiffSummary> = fc.record({
  fileCount: fc.integer({ min: 1, max: 50 }),
  files: fc.array(
    fc.record({
      filePath: pathArb,
      added: fc.integer({ min: 0, max: 1000 }),
      removed: fc.integer({ min: 0, max: 1000 }),
    }),
    { maxLength: 20 },
  ),
  totalAdded: fc.integer({ min: 0, max: 5000 }),
  totalRemoved: fc.integer({ min: 0, max: 5000 }),
  fullDiffPath: fc.oneof(fc.constant(null), pathArb),
});

const gitStatusSummaryArb: fc.Arbitrary<GitStatusSummary> = fc.record({
  staged: fc.record({
    count: fc.integer({ min: 0, max: 40 }),
    files: fc.array(pathArb, { maxLength: 15 }),
  }),
  modified: fc.record({
    count: fc.integer({ min: 0, max: 40 }),
    files: fc.array(pathArb, { maxLength: 15 }),
  }),
  untracked: fc.record({
    count: fc.integer({ min: 0, max: 40 }),
    files: fc.array(pathArb, { maxLength: 15 }),
  }),
});

const subagentSummaryArb: fc.Arbitrary<SubagentSummary> = fc
  .tuple(
    fc.constantFrom("DONE", "DONE_WITH_CONCERNS", "NEEDS_CONTEXT", "BLOCKED") as fc.Arbitrary<
      "DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED"
    >,
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.array(pathArb, { maxLength: 5 }),
    fc.record({
      passed: fc.integer({ min: 0, max: 500 }),
      failed: fc.integer({ min: 0, max: 50 }),
    }),
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.option(fc.string({ minLength: 1, maxLength: 100 })),
    fc.option(fc.array(fc.string({ minLength: 1, maxLength: 80 }), { maxLength: 3 })),
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
// Property 7: Subagent summary round-trip
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 7: Subagent summary round-trip", () => {
  it("serialize then deserialize yields semantically equivalent object", () => {
    fc.assert(
      fc.property(subagentSummaryArb, (original) => {
        const serialized = serializeSubagentSummary(original);
        const parsed = deserializeSubagentSummary(serialized);
        expect(parsed.status).toBe(original.status);
        expect(parsed.taskDescription).toBe(original.taskDescription);
        expect(parsed.changedFiles).toEqual(original.changedFiles);
        expect(parsed.testResult).toEqual(original.testResult);
        expect(parsed.commitMessage).toBe(original.commitMessage);
        expect(parsed.selfCheckResults).toBe(original.selfCheckResults);
        expect(parsed.blockingReason).toBe(original.blockingReason);
        // Empty concerns array and undefined are semantically equivalent (no concerns)
        if (original.concerns && original.concerns.length > 0) {
          expect(parsed.concerns).toEqual(original.concerns);
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Explore summary round-trip
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 8: Explore summary round-trip", () => {
  it("serialize then deserialize yields semantically equivalent object", () => {
    fc.assert(
      fc.property(exploreSummaryArb, (original) => {
        const serialized = serializeExploreSummary(original);
        const parsed = deserializeExploreSummary(serialized);
        expect(parsed.entryPoints).toEqual(original.entryPoints);
        expect(parsed.dependencyChain).toEqual(original.dependencyChain);
        expect(parsed.relatedTests).toEqual(original.relatedTests);
        expect(parsed.keyInterfaces).toEqual(original.keyInterfaces);
        expect(parsed.fileGroups).toEqual(original.fileGroups);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Review summary round-trip
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 9: Review summary round-trip", () => {
  it("serialize then deserialize yields semantically equivalent object", () => {
    fc.assert(
      fc.property(reviewSummaryArb, (original) => {
        const serialized = serializeReviewSummary(original);
        const parsed = deserializeReviewSummary(serialized);
        expect(parsed.filePath).toBe(original.filePath);
        expect(parsed.severityCounts).toEqual(original.severityCounts);
        expect(parsed.findings).toEqual(original.findings);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Test output summary round-trip
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 10: Test output summary round-trip", () => {
  it("serialize then deserialize yields semantically equivalent object", () => {
    fc.assert(
      fc.property(testOutputSummaryArb, (original) => {
        const serialized = serializeTestOutput(original);
        const parsed = deserializeTestOutput(serialized);
        expect(parsed.total).toBe(original.total);
        expect(parsed.passed).toBe(original.passed);
        expect(parsed.failed).toBe(original.failed);
        expect(parsed.skipped).toBe(original.skipped);
        expect(parsed.failures).toEqual(original.failures);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Git output summary round-trip
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Property 11: Git output summary round-trip", () => {
  it("GitDiffSummary round-trip", () => {
    fc.assert(
      fc.property(gitDiffSummaryArb, (original) => {
        const serialized = serializeGitDiff(original, 51);
        const parsed = deserializeGitDiff(serialized);
        expect(parsed.files).toEqual(original.files);
        expect(parsed.totalAdded).toBe(original.totalAdded);
        expect(parsed.totalRemoved).toBe(original.totalRemoved);
      }),
    );
  });

  it("GitStatusSummary round-trip", () => {
    fc.assert(
      fc.property(gitStatusSummaryArb, (original) => {
        // Use summary format (>30 files) for round-trip
        const serialized = serializeGitStatus(original, 31);
        const parsed = deserializeGitStatus(serialized);
        expect(parsed.staged.count).toBe(original.staged.count);
        expect(parsed.modified.count).toBe(original.modified.count);
        expect(parsed.untracked.count).toBe(original.untracked.count);
        expect(parsed.staged.files).toEqual(original.staged.files.slice(0, 10));
        expect(parsed.modified.files).toEqual(original.modified.files.slice(0, 10));
        expect(parsed.untracked.files).toEqual(original.untracked.files.slice(0, 10));
      }),
    );
  });
});
