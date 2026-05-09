import { describe, it, expect } from "vitest";
import { checkShipGateWithAcceptance } from "../../src/ship.js";
import type { ReviewResult, TestResult, ProgressResult } from "../../src/ship.js";
import type { AcceptGateDecision } from "../../src/accept-gate.js";

const passReview: ReviewResult = { passed: true, p0Count: 0, p1Count: 0 };
const passTest: TestResult = { passed: true };
const doneProgress: ProgressResult = { totalTasks: 3, completedTasks: 3 };

const noBlock: AcceptGateDecision = { block: false };
const blocked: AcceptGateDecision = { block: true, reason: "acceptance not run" };

describe("checkShipGateWithAcceptance", () => {
  it("passes when all 3 base gates pass and accept-gate does not block", () => {
    const result = checkShipGateWithAcceptance(passReview, passTest, doneProgress, noBlock);
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("blocks when accept-gate blocks even if base gates pass", () => {
    const result = checkShipGateWithAcceptance(passReview, passTest, doneProgress, blocked);
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("Acceptance"))).toBe(true);
  });

  it("includes accept-gate warning as advisory reason", () => {
    const warning: AcceptGateDecision = { block: false, warning: "no scenarios" };
    const result = checkShipGateWithAcceptance(passReview, passTest, doneProgress, warning);
    expect(result.allowed).toBe(true);
    expect(result.reasons.some((r) => r.includes("no scenarios"))).toBe(true);
  });

  it("reports base gate failures alongside accept-gate block", () => {
    const failTest: TestResult = { passed: false };
    const result = checkShipGateWithAcceptance(passReview, failTest, doneProgress, blocked);
    expect(result.allowed).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
