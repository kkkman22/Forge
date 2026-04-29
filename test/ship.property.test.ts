/**
 * Property 11: Ship 门禁——评审通过且测试通过且任务完成
 *
 * Uses fast-check to generate review result, test result, and progress completion
 * combinations, verifying that ship is allowed ONLY when all three pass,
 * and blocked with specific reasons when any fails.
 *
 * **Validates: Requirements 6.6, 6.7, 7.5, 8.1, 8.2, 16.3, 16.4**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ChecklistEntry } from "../src/fix-checklist.js";
import {
  checkShipGate,
  checkShipGateWithChecklist,
  type ProgressResult,
  type ReviewResult,
  type TestResult,
} from "../src/ship.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A review result that passed (no P0/P1). */
const passedReviewArb: fc.Arbitrary<ReviewResult> = fc.constant({
  passed: true,
  p0Count: 0,
  p1Count: 0,
});

/** A review result that failed (has P0 and/or P1 issues). */
const failedReviewArb: fc.Arbitrary<ReviewResult> = fc
  .tuple(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 10 }))
  .filter(([p0, p1]) => p0 > 0 || p1 > 0)
  .map(([p0Count, p1Count]) => ({
    passed: false,
    p0Count,
    p1Count,
  }));

/** Any review result. */
const anyReviewArb: fc.Arbitrary<ReviewResult> = fc.oneof(passedReviewArb, failedReviewArb);

/** A test result that passed. */
const passedTestArb: fc.Arbitrary<TestResult> = fc.constant({ passed: true });

/** A test result that failed. */
const failedTestArb: fc.Arbitrary<TestResult> = fc.constant({ passed: false });

/** Any test result. */
const anyTestArb: fc.Arbitrary<TestResult> = fc.oneof(passedTestArb, failedTestArb);

/** A progress result where all tasks are complete. */
const completeProgressArb: fc.Arbitrary<ProgressResult> = fc
  .integer({ min: 1, max: 20 })
  .map((total) => ({ totalTasks: total, completedTasks: total }));

/** A progress result where some tasks are incomplete. */
const incompleteProgressArb: fc.Arbitrary<ProgressResult> = fc
  .tuple(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 0, max: 19 }))
  .filter(([total, completed]) => completed < total)
  .map(([totalTasks, completedTasks]) => ({ totalTasks, completedTasks }));

/** Any progress result. */
const anyProgressArb: fc.Arbitrary<ProgressResult> = fc.oneof(
  completeProgressArb,
  incompleteProgressArb,
);

/** The one allowed combination: all three gates pass. */
const allPassArb: fc.Arbitrary<{
  review: ReviewResult;
  test: TestResult;
  progress: ProgressResult;
}> = fc
  .tuple(passedReviewArb, passedTestArb, completeProgressArb)
  .map(([review, test, progress]) => ({ review, test, progress }));

/** Any combination where at least one gate fails. */
const someFailArb: fc.Arbitrary<{
  review: ReviewResult;
  test: TestResult;
  progress: ProgressResult;
}> = fc
  .tuple(anyReviewArb, anyTestArb, anyProgressArb)
  .filter(([review, test, progress]) => {
    const reviewOk = review.passed && review.p0Count === 0 && review.p1Count === 0;
    const testOk = test.passed;
    const progressOk = progress.completedTasks >= progress.totalTasks;
    return !(reviewOk && testOk && progressOk);
  })
  .map(([review, test, progress]) => ({ review, test, progress }));

// ---------------------------------------------------------------------------
// Property 11: Ship 门禁——评审通过且测试通过且任务完成
// ---------------------------------------------------------------------------

describe("Property 11: Ship 门禁——评审通过且测试通过且任务完成", () => {
  it("all three gates pass → ship allowed (Req 8.1, 8.2)", () => {
    fc.assert(
      fc.property(allPassArb, ({ review, test, progress }) => {
        const result = checkShipGate(review, test, progress);

        expect(result.allowed).toBe(true);
        expect(result.reasons).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it("any gate fails → ship blocked (Req 8.2)", () => {
    fc.assert(
      fc.property(someFailArb, ({ review, test, progress }) => {
        const result = checkShipGate(review, test, progress);

        expect(result.allowed).toBe(false);
        expect(result.reasons.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  it("review has P0/P1 → blocked with review reason (Req 6.6, 16.3)", () => {
    fc.assert(
      fc.property(failedReviewArb, passedTestArb, completeProgressArb, (review, test, progress) => {
        const result = checkShipGate(review, test, progress);

        expect(result.allowed).toBe(false);
        expect(result.reasons.some((r) => r.includes("Review 未通过"))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("review with only P2/P3 (passed=true, p0=0, p1=0) → ship allowed (Req 6.7)", () => {
    fc.assert(
      fc.property(passedReviewArb, passedTestArb, completeProgressArb, (review, test, progress) => {
        const result = checkShipGate(review, test, progress);

        expect(result.allowed).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("test not passed → blocked with test reason (Req 7.5, 16.4)", () => {
    fc.assert(
      fc.property(passedReviewArb, failedTestArb, completeProgressArb, (review, test, progress) => {
        const result = checkShipGate(review, test, progress);

        expect(result.allowed).toBe(false);
        expect(result.reasons.some((r) => r.includes("Test 未通过"))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("progress incomplete → blocked with progress reason (Req 8.1)", () => {
    fc.assert(
      fc.property(
        passedReviewArb,
        passedTestArb,
        incompleteProgressArb,
        (review, test, progress) => {
          const result = checkShipGate(review, test, progress);

          expect(result.allowed).toBe(false);
          expect(result.reasons.some((r) => r.includes("Progress 未完成"))).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("all three fail → three reasons returned", () => {
    fc.assert(
      fc.property(
        failedReviewArb,
        failedTestArb,
        incompleteProgressArb,
        (review, test, progress) => {
          const result = checkShipGate(review, test, progress);

          expect(result.allowed).toBe(false);
          expect(result.reasons).toHaveLength(3);
          expect(result.reasons.some((r) => r.includes("Review 未通过"))).toBe(true);
          expect(result.reasons.some((r) => r.includes("Test 未通过"))).toBe(true);
          expect(result.reasons.some((r) => r.includes("Progress 未完成"))).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("for any combination, allowed ↔ (review ok ∧ test ok ∧ progress ok)", () => {
    fc.assert(
      fc.property(anyReviewArb, anyTestArb, anyProgressArb, (review, test, progress) => {
        const result = checkShipGate(review, test, progress);

        const reviewOk = review.passed && review.p0Count === 0 && review.p1Count === 0;
        const testOk = test.passed;
        const progressOk = progress.completedTasks >= progress.totalTasks;
        const expectedAllowed = reviewOk && testOk && progressOk;

        expect(result.allowed).toBe(expectedAllowed);
      }),
      { numRuns: 200 },
    );
  });

  it("reason count matches the number of failing gates", () => {
    fc.assert(
      fc.property(anyReviewArb, anyTestArb, anyProgressArb, (review, test, progress) => {
        const result = checkShipGate(review, test, progress);

        let expectedReasonCount = 0;
        const reviewOk = review.passed && review.p0Count === 0 && review.p1Count === 0;
        if (!reviewOk) expectedReasonCount++;
        if (!test.passed) expectedReasonCount++;
        if (progress.completedTasks < progress.totalTasks) expectedReasonCount++;

        expect(result.reasons).toHaveLength(expectedReasonCount);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 19: Ship gate blocks on unverified checklist entries (Req 10.3)
// ---------------------------------------------------------------------------

describe("Feature: forge-review-fix-optimization, Property 19: Ship gate blocks on unverified checklist", () => {
  const passedReview: ReviewResult = { passed: true, p0Count: 0, p1Count: 0 };
  const passedTest: TestResult = { passed: true };
  const completeProgress: ProgressResult = { totalTasks: 5, completedTasks: 5 };

  it("any non-verified entry → allowed: false", () => {
    const statuses: Array<ChecklistEntry["status"]> = ["unfixed", "in-progress", "fixed"];
    for (const status of statuses) {
      const checklist: ChecklistEntry[] = [
        {
          findingId: "F-001",
          severity: "P1",
          filePath: "src/a.ts",
          lineNumber: 1,
          description: "test",
          status,
        },
      ];
      const result = checkShipGateWithChecklist(
        passedReview,
        passedTest,
        completeProgress,
        checklist,
      );
      expect(result.allowed).toBe(false);
      expect(result.reasons.some((r) => r.includes("Checklist"))).toBe(true);
    }
  });

  it("all verified + other gates pass → allowed: true", () => {
    const checklist: ChecklistEntry[] = [
      {
        findingId: "F-001",
        severity: "P0",
        filePath: "src/a.ts",
        lineNumber: 1,
        description: "test",
        status: "verified",
        fixCommit: "abc1234",
      },
      {
        findingId: "F-002",
        severity: "P1",
        filePath: "src/b.ts",
        lineNumber: 10,
        description: "test2",
        status: "verified",
        fixCommit: "def5678",
      },
    ];
    const result = checkShipGateWithChecklist(
      passedReview,
      passedTest,
      completeProgress,
      checklist,
    );
    expect(result.allowed).toBe(true);
  });

  it("no checklist provided → behaves like checkShipGate", () => {
    const result = checkShipGateWithChecklist(passedReview, passedTest, completeProgress);
    expect(result.allowed).toBe(true);
  });

  it("empty checklist → behaves like checkShipGate", () => {
    const result = checkShipGateWithChecklist(passedReview, passedTest, completeProgress, []);
    expect(result.allowed).toBe(true);
  });
});
