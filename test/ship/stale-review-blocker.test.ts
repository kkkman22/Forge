import { beforeAll, describe, expect, it } from "vitest";

describe("checkShipGateWithFreshness blocks stale review", () => {
  let checkShipGateWithFreshness: typeof import("../../src/ship.js").checkShipGateWithFreshness;

  beforeAll(async () => {
    const mod = await import("../../src/ship.js");
    checkShipGateWithFreshness = mod.checkShipGateWithFreshness;
  });

  const PASSING_REVIEW = {
    passed: true,
    p0Count: 0,
    p1Count: 0,
    methodology: "subagent-parallel" as const,
  };
  const PASSING_TEST = { passed: true };
  const COMPLETE_PROGRESS = { completedTasks: 5, totalTasks: 5 };

  it("blocks ship when non-.tinkerman/ files changed after review", () => {
    const result = checkShipGateWithFreshness(
      { ...PASSING_REVIEW, reviewedAtCommit: "aaa111" },
      PASSING_TEST,
      COMPLETE_PROGRESS,
      "bbb222",
      ["src/main.ts", ".tinkerman/status.md"],
    );

    expect(result.allowed).toBe(false);
    expect(
      result.reasons.some(
        (r: string) => r.includes("stale") || r.includes("Stale") || r.includes("Review"),
      ),
    ).toBe(true);
  });

  it("allows ship when only .tinkerman/ files changed", () => {
    const result = checkShipGateWithFreshness(
      { ...PASSING_REVIEW, reviewedAtCommit: "aaa111" },
      PASSING_TEST,
      COMPLETE_PROGRESS,
      "bbb222",
      [".tinkerman/status.md", ".tinkerman/progress/tasks.md"],
    );

    expect(result.allowed).toBe(true);
  });

  it("allows ship when reviewedCommit matches currentHead", () => {
    const result = checkShipGateWithFreshness(
      { ...PASSING_REVIEW, reviewedAtCommit: "aaa111" },
      PASSING_TEST,
      COMPLETE_PROGRESS,
      "aaa111",
      [],
    );

    expect(result.allowed).toBe(true);
  });

  it("allows ship when reviewedCommit is undefined (backward compat)", () => {
    const result = checkShipGateWithFreshness(
      { ...PASSING_REVIEW, reviewedAtCommit: undefined },
      PASSING_TEST,
      COMPLETE_PROGRESS,
      "bbb222",
      ["src/main.ts"],
    );

    expect(result.allowed).toBe(true);
  });
});
