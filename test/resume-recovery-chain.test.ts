import { describe, expect, it } from "vitest";
import { RECOVERY_CHAIN_STEPS, type RecoveryChainInput, runRecoveryChain } from "../src/resume.js";

// Git log lines are separator (\x00) delimited: hash \x00 message \x00 timestamp.
const SEP = "\x00";
function gitLine(hash: string, message: string, timestamp: string): string {
  return [hash, message, timestamp].join(SEP);
}

const baseInput = {
  taskName: "topic-a",
  currentPhase: "build",
  tier: "standard" as const,
  taskOrder: ["1", "2", "3"],
  progressEntries: [
    { taskId: "1", taskTitle: "T1", completed: true, completionTime: "2026-06-01T00:00:00Z" },
    // Task 2 is committed (see gitLogRaw below) but NOT marked complete here.
    { taskId: "2", taskTitle: "T2", completed: false, completionTime: null },
    { taskId: "3", taskTitle: "T3", completed: false, completionTime: null },
  ],
};

describe("runRecoveryChain (error-recovery-strategy R7)", () => {
  it("exposes the 8-step priority chain in fixed order", () => {
    expect(RECOVERY_CHAIN_STEPS).toHaveLength(8);
    expect(RECOVERY_CHAIN_STEPS[0]).toBe("read-status-document");
    expect(RECOVERY_CHAIN_STEPS[2]).toBe("scan-git-log");
    expect(RECOVERY_CHAIN_STEPS[7]).toBe("generate-report");
  });

  it("detects committed-but-not-marked inconsistency (collects, not stops)", () => {
    const plan = [
      "## Task 1: first",
      "commit: feat(topic-a): first done",
      "## Task 2: second",
      "commit: feat(topic-a): second done",
      "## Task 3: third",
      "commit: feat(topic-a): third done",
    ].join("\n");

    const input: RecoveryChainInput = {
      ...baseInput,
      // Commit for task 2 exists, but progressEntries marks task 2 incomplete.
      gitLogRaw: gitLine("aaa1111", "feat(topic-a): second done", "2026-06-02T00:00:00Z"),
      gitStatusRaw: "",
      planContent: plan,
    };

    const report = runRecoveryChain(input);

    // R7.2: report is produced (never stops at first detection) and carries
    // the committed-but-not-marked inconsistency for task 2.
    expect(report.header.taskName).toBe("topic-a");
    expect(report.header.interruptionCategory).toBe("committed-not-progress-updated");
    const committed = report.inconsistencies.filter((i) => i.category.includes("committed"));
    expect(committed.length).toBeGreaterThan(0);
    expect(committed.some((i) => i.evidence.includes("aaa1111"))).toBe(true);
    // Summary counts must agree with the inconsistencies array.
    expect(report.summary.totalInconsistencies).toBe(report.inconsistencies.length);
  });

  it("returns a clean report when git and progress agree and phase is terminal", () => {
    const plan = ["## Task 1: first", "commit: feat(topic-a): T1 done"].join("\n");

    const input: RecoveryChainInput = {
      taskName: "topic-a",
      // "ship" is terminal in the standard sequence → no phase-advance gap.
      currentPhase: "ship",
      tier: "standard",
      taskOrder: ["1"],
      progressEntries: [
        { taskId: "1", taskTitle: "T1", completed: true, completionTime: "2026-06-01T00:00:00Z" },
      ],
      gitLogRaw: gitLine("aaa1111", "feat(topic-a): T1 done", "2026-06-01T00:00:00Z"),
      gitStatusRaw: "",
      planContent: plan,
    };

    const report = runRecoveryChain(input);
    // No committed-but-not-marked, no uncommitted changes, terminal phase → clean.
    expect(report.header.interruptionCategory).toBe("clean-state");
    expect(report.summary.totalInconsistencies).toBe(0);
  });

  it("flags uncommitted working-tree changes", () => {
    const input: RecoveryChainInput = {
      ...baseInput,
      gitLogRaw: "",
      gitStatusRaw: "M src/foo.ts\nA src/bar.ts",
      planContent: "## Task 1: first\ncommit: feat(topic-a): T1\n",
    };

    const report = runRecoveryChain(input);
    // Uncommitted changes are surfaced via the interruption category.
    expect(report.header.interruptionCategory).not.toBe("clean-state");
  });
});
