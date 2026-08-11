/**
 * Preservation tests — verify existing ship flow is unchanged.
 *
 * These tests validate that:
 *   - checkShipGate still works with ReviewResult/TestResult/ProgressResult
 *   - checkShipGateWithChecklist still works
 *   - checkShipGateWithFreshness still works
 *   - checkShipGateWithForceSkip still works
 *   - checkShipGateWithAcceptance still works
 *   - checkReviewFreshness still works
 *   - The new ship-gates module does not alter existing behavior
 *
 * **Requirements: existing behavior preservation**
 */

import { describe, expect, it } from "vitest";
import type { ChecklistEntry } from "../src/fix-checklist.js";
import {
  checkReviewFreshness,
  checkShipGate,
  checkShipGateWithAcceptance,
  checkShipGateWithChecklist,
  checkShipGateWithForceSkip,
  checkShipGateWithFreshness,
  type ProgressResult,
  type ReviewResult,
  type TestResult,
} from "../src/ship.js";

// ---------------------------------------------------------------------------
// Preservation: checkShipGate basic behavior
// ---------------------------------------------------------------------------

describe("Preservation: checkShipGate basic behavior", () => {
  const passedReview: ReviewResult = { passed: true, p0Count: 0, p1Count: 0 };
  const passedTest: TestResult = { passed: true };
  const completeProgress: ProgressResult = { totalTasks: 3, completedTasks: 3 };

  it("all gates pass → allowed", () => {
    const result = checkShipGate(passedReview, passedTest, completeProgress);
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("review fails → blocked with review reason", () => {
    const failedReview: ReviewResult = { passed: false, p0Count: 1, p1Count: 0 };
    const result = checkShipGate(failedReview, passedTest, completeProgress);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Review"))).toBe(true);
  });

  it("test fails → blocked with test reason", () => {
    const failedTest: TestResult = { passed: false };
    const result = checkShipGate(passedReview, failedTest, completeProgress);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Test"))).toBe(true);
  });

  it("progress incomplete → blocked with progress reason", () => {
    const incompleteProgress: ProgressResult = { totalTasks: 5, completedTasks: 3 };
    const result = checkShipGate(passedReview, passedTest, incompleteProgress);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Progress"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Preservation: checkShipGateWithChecklist
// ---------------------------------------------------------------------------

describe("Preservation: checkShipGateWithChecklist", () => {
  const passedReview: ReviewResult = { passed: true, p0Count: 0, p1Count: 0 };
  const passedTest: TestResult = { passed: true };
  const completeProgress: ProgressResult = { totalTasks: 1, completedTasks: 1 };

  it("no checklist → behaves like checkShipGate", () => {
    const result = checkShipGateWithChecklist(passedReview, passedTest, completeProgress);
    expect(result.allowed).toBe(true);
  });

  it("empty checklist → behaves like checkShipGate", () => {
    const result = checkShipGateWithChecklist(passedReview, passedTest, completeProgress, []);
    expect(result.allowed).toBe(true);
  });

  it("all verified checklist → allowed", () => {
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
    ];
    const result = checkShipGateWithChecklist(
      passedReview,
      passedTest,
      completeProgress,
      checklist,
    );
    expect(result.allowed).toBe(true);
  });

  it("unverified checklist → blocked", () => {
    const checklist: ChecklistEntry[] = [
      {
        findingId: "F-001",
        severity: "P1",
        filePath: "src/a.ts",
        lineNumber: 1,
        description: "test",
        status: "unfixed",
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
  });
});

// ---------------------------------------------------------------------------
// Preservation: checkShipGateWithFreshness
// ---------------------------------------------------------------------------

describe("Preservation: checkShipGateWithFreshness", () => {
  const passedReview: ReviewResult = {
    passed: true,
    p0Count: 0,
    p1Count: 0,
    reviewedAtCommit: "abc1234",
  };
  const passedTest: TestResult = { passed: true };
  const completeProgress: ProgressResult = { totalTasks: 1, completedTasks: 1 };

  it("fresh review → allowed, no freshness warning", () => {
    const result = checkShipGateWithFreshness(
      passedReview,
      passedTest,
      completeProgress,
      "abc1234",
      [],
    );
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("stale review with non-forge changes → blocked", () => {
    const result = checkShipGateWithFreshness(
      passedReview,
      passedTest,
      completeProgress,
      "def5678",
      ["src/ship.ts"],
    );
    // Stale review now blocks ship per REQ-03
    expect(result.allowed).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("stale review with only .tinkerman/ changes → allowed, no warning", () => {
    const result = checkShipGateWithFreshness(
      passedReview,
      passedTest,
      completeProgress,
      "def5678",
      [".tinkerman/status.md"],
    );
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Preservation: checkShipGateWithForceSkip
// ---------------------------------------------------------------------------

describe("Preservation: checkShipGateWithForceSkip", () => {
  const failedReview: ReviewResult = { passed: false, p0Count: 2, p1Count: 1 };
  const failedTest: TestResult = { passed: false };
  const incompleteProgress: ProgressResult = { totalTasks: 5, completedTasks: 1 };

  it("force skip with reason → allowed with SKIPPED-BY-FORCE", () => {
    const result = checkShipGateWithForceSkip(failedReview, failedTest, incompleteProgress, {
      forceSkipReview: true,
      forceSkipReason: "hotfix for production",
    });
    expect(result.allowed).toBe(true);
    expect(result.forceSkipped).toBe(true);
    expect(result.reasons[0]).toContain("SKIPPED-BY-FORCE");
  });

  it("force skip without reason → throws", () => {
    expect(() =>
      checkShipGateWithForceSkip(failedReview, failedTest, incompleteProgress, {
        forceSkipReview: true,
      }),
    ).toThrow();
  });

  it("not force skipping → normal checkShipGate behavior", () => {
    const result = checkShipGateWithForceSkip(failedReview, failedTest, incompleteProgress, {
      forceSkipReview: false,
    });
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Preservation: checkShipGateWithAcceptance
// ---------------------------------------------------------------------------

describe("Preservation: checkShipGateWithAcceptance", () => {
  const passedReview: ReviewResult = { passed: true, p0Count: 0, p1Count: 0 };
  const passedTest: TestResult = { passed: true };
  const completeProgress: ProgressResult = { totalTasks: 1, completedTasks: 1 };

  it("acceptance not blocking → allowed", () => {
    const result = checkShipGateWithAcceptance(passedReview, passedTest, completeProgress, {
      block: false,
      warning: undefined,
    });
    expect(result.allowed).toBe(true);
  });

  it("acceptance blocking → not allowed", () => {
    const result = checkShipGateWithAcceptance(passedReview, passedTest, completeProgress, {
      block: true,
      reason: "acceptance test failed",
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Forced Acceptance"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Preservation: checkReviewFreshness
// ---------------------------------------------------------------------------

describe("Preservation: checkReviewFreshness", () => {
  it("undefined reviewedCommit → fresh (backward compat)", () => {
    const result = checkReviewFreshness(undefined, "abc1234", ["src/a.ts"]);
    expect(result.fresh).toBe(true);
  });

  it("same commit → fresh", () => {
    const result = checkReviewFreshness("abc1234", "abc1234", ["src/a.ts"]);
    expect(result.fresh).toBe(true);
  });

  it("different commit, only .tinkerman/ changes → fresh", () => {
    const result = checkReviewFreshness("abc1234", "def5678", [".tinkerman/status.md"]);
    expect(result.fresh).toBe(true);
  });

  it("different commit, non-forge changes → not fresh", () => {
    const result = checkReviewFreshness("abc1234", "def5678", ["src/ship.ts"]);
    expect(result.fresh).toBe(false);
    expect(result.changedFiles).toEqual(["src/ship.ts"]);
  });
});

// ---------------------------------------------------------------------------
// Preservation: methodology=unavailable blocks ship
// ---------------------------------------------------------------------------

describe("Preservation: methodology=unavailable blocks ship", () => {
  const passedTest: TestResult = { passed: true };
  const completeProgress: ProgressResult = { totalTasks: 1, completedTasks: 1 };

  it("methodology=unavailable → blocked even if review passed", () => {
    const review: ReviewResult = {
      passed: true,
      p0Count: 0,
      p1Count: 0,
      methodology: "unavailable",
    };
    const result = checkShipGate(review, passedTest, completeProgress);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("unavailable"))).toBe(true);
  });

  it("methodology=subagent-parallel → not blocked by methodology", () => {
    const review: ReviewResult = {
      passed: true,
      p0Count: 0,
      p1Count: 0,
      methodology: "subagent-parallel",
    };
    const result = checkShipGate(review, passedTest, completeProgress);
    expect(result.allowed).toBe(true);
  });
});
