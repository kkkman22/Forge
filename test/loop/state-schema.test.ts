/**
 * @file Loop State JSON Schema validation tests.
 * Validates that the loop state template covers all required fields and
 * that field values conform to expected types and enums.
 *
 * RED: This test will fail until .forge/templates/loop-state.json is created.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TEMPLATE_PATH = resolve(__dirname, "../../.forge/templates/loop-state.json");

/** All required top-level fields in loop state. */
const REQUIRED_FIELDS = [
  "id",
  "goal",
  "phase",
  "consecutiveFailures",
  "totalIterations",
  "tier",
  "lastSuccessCommit",
  "branch",
  "stopWhen",
  "lastScheduledAt",
  "nextScheduledReason",
  "createdAt",
  "phaseHistory",
  "lastReviewResult",
  "haltReason",
  "packageState",
] as const;

/** Valid phase values. */
const VALID_PHASES = [
  "init",
  "plan",
  "build",
  "review",
  "test",
  "ship",
  "halted",
  "completed",
] as const;

/** Valid tier values. */
const VALID_TIERS = ["light", "standard", "full"] as const;

/** Valid review result values. */
const VALID_REVIEW_RESULTS = ["passed", "failed-p0", "failed-p1", "not-run"] as const;

type Phase = (typeof VALID_PHASES)[number];
type Tier = (typeof VALID_TIERS)[number];

interface PhaseHistoryEntry {
  phase: Phase;
  enteredAt: string;
  exitedAt?: string;
  result?: string;
}

interface LoopState {
  id: string;
  goal: string;
  phase: Phase;
  consecutiveFailures: number;
  totalIterations: number;
  tier: Tier;
  lastSuccessCommit: string;
  branch: string;
  stopWhen: string;
  lastScheduledAt: string;
  nextScheduledReason: string;
  createdAt: string;
  phaseHistory: PhaseHistoryEntry[];
  lastReviewResult: (typeof VALID_REVIEW_RESULTS)[number];
  haltReason: string;
  packageState: {
    currentPackage: string;
    completedPackages: string[];
    nextPackage: string;
    packageCount: number;
  };
}

function loadTemplate(): LoopState {
  const raw = readFileSync(TEMPLATE_PATH, "utf-8");
  return JSON.parse(raw) as LoopState;
}

describe("Loop State JSON Schema", () => {
  it("template file exists and is valid JSON", () => {
    const state = loadTemplate();
    expect(state).toBeDefined();
    expect(typeof state).toBe("object");
  });

  it("contains all required fields", () => {
    const state = loadTemplate();
    for (const field of REQUIRED_FIELDS) {
      expect(state).toHaveProperty(field);
    }
  });

  it("id is a non-empty string", () => {
    const { id } = loadTemplate();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("goal is a non-empty string", () => {
    const { goal } = loadTemplate();
    expect(typeof goal).toBe("string");
    expect(goal.length).toBeGreaterThan(0);
  });

  it("phase is a valid enum value", () => {
    const { phase } = loadTemplate();
    expect(VALID_PHASES).toContain(phase);
  });

  it("consecutiveFailures is a non-negative integer", () => {
    const { consecutiveFailures } = loadTemplate();
    expect(Number.isInteger(consecutiveFailures)).toBe(true);
    expect(consecutiveFailures).toBeGreaterThanOrEqual(0);
  });

  it("totalIterations is a non-negative integer", () => {
    const { totalIterations } = loadTemplate();
    expect(Number.isInteger(totalIterations)).toBe(true);
    expect(totalIterations).toBeGreaterThanOrEqual(0);
  });

  it("tier is a valid enum value", () => {
    const { tier } = loadTemplate();
    expect(VALID_TIERS).toContain(tier);
  });

  it("lastSuccessCommit is a string", () => {
    const { lastSuccessCommit } = loadTemplate();
    expect(typeof lastSuccessCommit).toBe("string");
  });

  it("branch is a string", () => {
    const { branch } = loadTemplate();
    expect(typeof branch).toBe("string");
  });

  it("stopWhen is a string", () => {
    const { stopWhen } = loadTemplate();
    expect(typeof stopWhen).toBe("string");
  });

  it("lastScheduledAt is an ISO date string", () => {
    const { lastScheduledAt } = loadTemplate();
    expect(typeof lastScheduledAt).toBe("string");
    // Empty string is allowed for initial state
    if (lastScheduledAt.length > 0) {
      expect(new Date(lastScheduledAt).toISOString()).toBe(lastScheduledAt);
    }
  });

  it("nextScheduledReason is a string", () => {
    const { nextScheduledReason } = loadTemplate();
    expect(typeof nextScheduledReason).toBe("string");
  });

  it("createdAt is a valid ISO date string", () => {
    const { createdAt } = loadTemplate();
    expect(typeof createdAt).toBe("string");
    expect(createdAt.length).toBeGreaterThan(0);
    expect(new Date(createdAt).toISOString()).toBe(createdAt);
  });

  it("phaseHistory is an array", () => {
    const { phaseHistory } = loadTemplate();
    expect(Array.isArray(phaseHistory)).toBe(true);
  });

  it("lastReviewResult is a valid enum value", () => {
    const { lastReviewResult } = loadTemplate();
    expect(VALID_REVIEW_RESULTS).toContain(lastReviewResult);
  });

  it("haltReason is a string", () => {
    const { haltReason } = loadTemplate();
    expect(typeof haltReason).toBe("string");
  });

  it("packageState is initialized for package-aware loop resume", () => {
    const { packageState } = loadTemplate();
    expect(packageState).toEqual({
      currentPackage: "",
      completedPackages: [],
      nextPackage: "",
      packageCount: 0,
    });
  });

  it("default template represents a valid initial state", () => {
    const state = loadTemplate();
    expect(state.phase).toBe("init");
    expect(state.consecutiveFailures).toBe(0);
    expect(state.totalIterations).toBe(0);
    expect(state.lastSuccessCommit).toBe("");
    expect(state.phaseHistory).toEqual([]);
    expect(state.lastReviewResult).toBe("not-run");
    expect(state.haltReason).toBe("");
    expect(state.packageState.completedPackages).toEqual([]);
  });
});
