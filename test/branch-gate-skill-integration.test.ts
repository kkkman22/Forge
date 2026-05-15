/**
 * Integration tests verifying each skill's default severity and
 * the contract between skill access points and runBranchGate.
 */
import { describe, expect, it } from "vitest";
import {
  type BranchGateInput,
  type BranchGateSkill,
  DEFAULT_SEVERITY,
  runBranchGate,
} from "../src/branch-gate.js";

const skills: BranchGateSkill[] = ["plan", "build", "review", "test", "ship", "debug", "learn"];

const baseInput = (overrides: Partial<BranchGateInput> = {}): BranchGateInput => ({
  skill: "build",
  mode: "interactive",
  currentBranch: "feature/my-task",
  currentTask: "my-task",
  pendingDeliveries: [],
  alreadyCheckedThisPhase: false,
  isCleanTree: true,
  ...overrides,
});

describe("Skill integration", () => {
  it.each(skills)("skill %s: correct branch → passed", (skill) => {
    const result = runBranchGate(
      baseInput({
        skill,
        currentBranch: "feature/my-task",
        currentTask: "my-task",
      }),
    );
    expect(result.kind).toBe("passed");
  });

  it.each(skills)("skill %s: wrong branch obeys default severity", (skill) => {
    const result = runBranchGate(
      baseInput({
        skill,
        currentBranch: "feature/other-task",
        currentTask: "my-task",
      }),
    );
    const expected = DEFAULT_SEVERITY[skill] === "block" ? "blocked" : "warned";
    expect(result.kind).toBe(expected);
  });

  it.each(skills)("skill %s: severityOverride overrides default", (skill) => {
    const result = runBranchGate(
      baseInput({
        skill,
        currentBranch: "feature/other-task",
        currentTask: "my-task",
        severityOverride: "block",
      }),
    );
    expect(result.kind).toBe("blocked");
  });

  it.each(skills)("skill %s: alreadyCheckedThisPhase skips", (skill) => {
    const result = runBranchGate(
      baseInput({
        skill,
        alreadyCheckedThisPhase: true,
      }),
    );
    expect(result.kind).toBe("skipped");
  });

  it("debug with --cross-branch (severityOverride: warn) allows cross-branch", () => {
    const result = runBranchGate(
      baseInput({
        skill: "debug",
        currentBranch: "feature/other-task",
        currentTask: "my-task",
        severityOverride: "warn",
      }),
    );
    expect(result.kind).toBe("warned");
  });
});
