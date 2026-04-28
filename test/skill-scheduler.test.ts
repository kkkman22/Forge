/**
 * Unit tests (example-based) for the skill-scheduler module.
 *
 * Covers:
 *   - phase missing → returns router
 *   - ship → completed (tier ≠ full)
 *   - ship → learn (tier = full)
 *   - learn → completed
 *   - Unknown phase → falls back to router
 *   - getCommandSequence for each tier (light, standard, full)
 *   - getCommandSequence for unknown tier → defaults to standard
 *
 * **Validates: Requirements 3.2, 3.9, 3.10**
 */
import { describe, expect, it } from "vitest";
import {
  determineNextSkill,
  getCommandSequence,
  type SchedulerInput,
} from "../src/skill-scheduler.js";

// ---------------------------------------------------------------------------
// Helper: build a SchedulerInput with sensible defaults
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<SchedulerInput> = {}): SchedulerInput {
  return {
    reviewFixAttempts: 0,
    maxReviewFixAttempts: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// determineNextSkill — phase missing → router
// ---------------------------------------------------------------------------

describe("determineNextSkill: phase missing → router", () => {
  it("returns router when currentPhase is undefined", () => {
    const result = determineNextSkill(makeInput({ currentPhase: undefined }));
    expect(result.nextPhase).toBe("router");
    expect(result.reason).toBeDefined();
  });

  it("returns router when currentPhase is empty string", () => {
    const result = determineNextSkill(makeInput({ currentPhase: "" }));
    expect(result.nextPhase).toBe("router");
  });

  it("returns router when currentPhase is 'router'", () => {
    const result = determineNextSkill(makeInput({ currentPhase: "router" }));
    expect(result.nextPhase).toBe("router");
  });
});

// ---------------------------------------------------------------------------
// determineNextSkill: ship → completed (tier ≠ full)
// ---------------------------------------------------------------------------

describe("determineNextSkill: ship → completed (tier ≠ full)", () => {
  it("returns completed when phase is ship and tier is standard", () => {
    const result = determineNextSkill(makeInput({ currentPhase: "ship", tier: "standard" }));
    expect(result.nextPhase).toBe("completed");
  });

  it("returns completed when phase is ship and tier is light", () => {
    const result = determineNextSkill(makeInput({ currentPhase: "ship", tier: "light" }));
    expect(result.nextPhase).toBe("completed");
  });

  it("returns completed when phase is ship and tier is undefined", () => {
    const result = determineNextSkill(makeInput({ currentPhase: "ship", tier: undefined }));
    expect(result.nextPhase).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// determineNextSkill: ship → learn (tier = full)
// ---------------------------------------------------------------------------

describe("determineNextSkill: ship → learn (tier = full)", () => {
  it("returns learn when phase is ship and tier is full", () => {
    const result = determineNextSkill(makeInput({ currentPhase: "ship", tier: "full" }));
    expect(result.nextPhase).toBe("learn");
    expect(result.reason).toContain("learn");
  });
});

// ---------------------------------------------------------------------------
// determineNextSkill: learn → completed
// ---------------------------------------------------------------------------

describe("determineNextSkill: learn → completed", () => {
  it("returns completed when phase is learn", () => {
    const result = determineNextSkill(makeInput({ currentPhase: "learn" }));
    expect(result.nextPhase).toBe("completed");
  });

  it("returns completed when phase is learn regardless of tier", () => {
    const result = determineNextSkill(makeInput({ currentPhase: "learn", tier: "full" }));
    expect(result.nextPhase).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// determineNextSkill: unknown phase → falls back to router
// ---------------------------------------------------------------------------

describe("determineNextSkill: unknown phase → router fallback", () => {
  it("returns router for an unrecognized phase string", () => {
    const result = determineNextSkill(makeInput({ currentPhase: "deploy" }));
    expect(result.nextPhase).toBe("router");
    expect(result.reason).toContain("Unknown phase");
  });

  it("returns router for a random gibberish phase", () => {
    const result = determineNextSkill(makeInput({ currentPhase: "xyzzy_42" }));
    expect(result.nextPhase).toBe("router");
  });
});

// ---------------------------------------------------------------------------
// getCommandSequence — per tier
// ---------------------------------------------------------------------------

describe("getCommandSequence: returns correct sequence per tier", () => {
  it("light tier returns [build, review]", () => {
    expect(getCommandSequence("light")).toEqual(["build", "review"]);
  });

  it("standard tier returns [plan, build, review, test, ship]", () => {
    expect(getCommandSequence("standard")).toEqual(["plan", "build", "review", "test", "ship"]);
  });

  it("full tier returns [plan, build, review, test, ship, learn]", () => {
    expect(getCommandSequence("full")).toEqual([
      "plan",
      "build",
      "review",
      "test",
      "ship",
      "learn",
    ]);
  });
});

// ---------------------------------------------------------------------------
// getCommandSequence — unknown tier defaults to standard
// ---------------------------------------------------------------------------

describe("getCommandSequence: unknown tier defaults to standard", () => {
  it("returns standard sequence for unknown tier string", () => {
    const standard = getCommandSequence("standard");
    expect(getCommandSequence("enterprise")).toEqual(standard);
  });

  it("returns standard sequence for empty string tier", () => {
    const standard = getCommandSequence("standard");
    expect(getCommandSequence("")).toEqual(standard);
  });
});
