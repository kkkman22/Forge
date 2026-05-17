import { describe, expect, it } from "vitest";
import {
  checkShipGate,
  type ProgressResult,
  type ReviewResult,
  type TestResult,
} from "../../src/ship.js";

describe("checkShipGate — methodology field checks", () => {
  const passTest: TestResult = { passed: true };
  const doneProgress: ProgressResult = { totalTasks: 5, completedTasks: 5 };

  it("ship blocks when review.methodology is unavailable", () => {
    const review: ReviewResult & { methodology: "unavailable" } = {
      passed: false,
      p0Count: 0,
      p1Count: 0,
      methodology: "unavailable",
    };

    const result = checkShipGate(review, passTest, doneProgress);

    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("unavailable"))).toBe(true);
  });

  it("ship reason includes 'methodology=unavailable; subagent paths exhausted'", () => {
    const review: ReviewResult & { methodology: "unavailable" } = {
      passed: false,
      p0Count: 0,
      p1Count: 0,
      methodology: "unavailable",
    };

    const result = checkShipGate(review, passTest, doneProgress);

    expect(result.reasons.some((r) =>
      r.includes("methodology=unavailable") && r.includes("subagent paths exhausted"),
    )).toBe(true);
  });

  it("ship passes when review.methodology is subagent-parallel and other gates pass", () => {
    const review: ReviewResult & { methodology: "subagent-parallel" } = {
      passed: true,
      p0Count: 0,
      p1Count: 0,
      methodology: "subagent-parallel",
    };

    const result = checkShipGate(review, passTest, doneProgress);

    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("ship passes when review.methodology is subagent-serial and other gates pass", () => {
    const review: ReviewResult & { methodology: "subagent-serial" } = {
      passed: true,
      p0Count: 0,
      p1Count: 0,
      methodology: "subagent-serial",
    };

    const result = checkShipGate(review, passTest, doneProgress);

    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("ship passes when review.methodology is ci-evidence and other gates pass", () => {
    const review: ReviewResult & { methodology: "ci-evidence" } = {
      passed: true,
      p0Count: 0,
      p1Count: 0,
      methodology: "ci-evidence",
    };

    const result = checkShipGate(review, passTest, doneProgress);

    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });
});