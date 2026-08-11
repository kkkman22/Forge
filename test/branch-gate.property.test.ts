/**
 * Property-based tests for branch-gate module.
 *
 * Invariants:
 * 1. Frequency control: alreadyCheckedThisPhase=true always returns skipped
 * 2. currentTask=null always returns skipped
 * 3. main/master always passes
 * 4. auto_fixed only when autonomous + clean tree + valid format + topic mismatch
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type BranchGateInput,
  type BranchGateSkill,
  DEFAULT_SEVERITY,
  runBranchGate,
} from "../src/branch-gate.js";

const branchSkillArb = fc.constantFrom<BranchGateSkill>(
  "plan",
  "build",
  "review",
  "test",
  "ship",
  "debug",
  "learn",
);

const branchNameArb = fc.oneof(
  fc
    .tuple(fc.constantFrom("feature", "tinkerman"), fc.string({ minLength: 1, maxLength: 20 }))
    .map(([prefix, topic]) => `${prefix}/${topic}`),
  fc.string({ minLength: 1, maxLength: 20 }),
);

const baseInput = (overrides: Partial<BranchGateInput> = {}): BranchGateInput => ({
  skill: "build",
  mode: "interactive",
  currentBranch: "feature/test-task",
  currentTask: "test-task",
  pendingDeliveries: [],
  alreadyCheckedThisPhase: false,
  isCleanTree: true,
  ...overrides,
});

describe("Branch Gate PBT", () => {
  it("alreadyCheckedThisPhase=true always returns skipped", () => {
    fc.assert(
      fc.property(
        branchSkillArb,
        branchNameArb,
        fc.string({ minLength: 1 }),
        (skill, branch, task) => {
          const result = runBranchGate(
            baseInput({
              skill,
              currentBranch: branch,
              currentTask: task,
              alreadyCheckedThisPhase: true,
            }),
          );
          return (
            result.kind === "skipped" &&
            (result as { reason: string }).reason === "already_checked_this_phase"
          );
        },
      ),
    );
  });

  it("currentTask=null always returns skipped", () => {
    fc.assert(
      fc.property(branchSkillArb, branchNameArb, (skill, branch) => {
        const result = runBranchGate(
          baseInput({
            skill,
            currentBranch: branch,
            currentTask: null,
          }),
        );
        return (
          result.kind === "skipped" && (result as { reason: string }).reason === "no_current_task"
        );
      }),
    );
  });

  it("DEFAULT_SEVERITY covers all skills", () => {
    const skills: BranchGateSkill[] = ["plan", "build", "review", "test", "ship", "debug", "learn"];
    for (const skill of skills) {
      expect(["block", "warn"]).toContain(DEFAULT_SEVERITY[skill]);
    }
  });

  it("main/master branch always passes regardless of other inputs", () => {
    fc.assert(
      fc.property(branchSkillArb, fc.constantFrom("autonomous", "interactive"), (skill, mode) => {
        const result = runBranchGate(
          baseInput({
            skill,
            mode: mode as BranchGateInput["mode"],
            currentBranch: "main",
            currentTask: "anything",
          }),
        );
        return result.kind === "passed";
      }),
    );
  });

  it("auto_fixed only when autonomous + clean tree + valid format + topic mismatch", () => {
    fc.assert(
      fc.property(
        branchSkillArb,
        fc.string({ minLength: 1, maxLength: 20 }).filter((t) => t !== "target-task"),
        (skill, otherTopic) => {
          const resultClean = runBranchGate(
            baseInput({
              skill,
              mode: "autonomous",
              currentBranch: `feature/${otherTopic}`,
              currentTask: "target-task",
              isCleanTree: true,
            }),
          );
          if (resultClean.kind !== "auto_fixed") return false;

          const resultDirty = runBranchGate(
            baseInput({
              skill,
              mode: "autonomous",
              currentBranch: `feature/${otherTopic}`,
              currentTask: "target-task",
              isCleanTree: false,
            }),
          );
          return resultDirty.kind !== "auto_fixed";
        },
      ),
    );
  });
});
