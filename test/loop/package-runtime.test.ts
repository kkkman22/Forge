import { describe, expect, it } from "vitest";
import { advanceLoopAfterPhaseSuccess } from "../../src/loop/package-runtime.js";

const PACKAGES = [
  { id: "P1", depends_on_packages: [] },
  { id: "P2", depends_on_packages: ["P1"] },
];

const BASE_STATUS = `---
current_task: "demo"
tier: "standard"
phase: "plan"
loop_iteration: 0
---
# Status
`;

describe("advanceLoopAfterPhaseSuccess", () => {
  it("initializes the first execution package after plan succeeds", () => {
    const result = advanceLoopAfterPhaseSuccess({
      loopState: {
        id: "loop-1",
        phase: "plan",
        tier: "standard",
        totalIterations: 0,
        consecutiveFailures: 0,
        lastReviewResult: "not-run",
      },
      statusContent: BASE_STATUS,
      executionPackages: PACKAGES,
      now: "2026-06-08T00:00:00.000Z",
    });

    expect(result.nextForgeArgs).toBe("build --package P1");
    expect(result.loopState.phase).toBe("build");
    expect(result.loopState.packageState).toEqual({
      currentPackage: "P1",
      completedPackages: [],
      nextPackage: "P2",
      packageCount: 2,
    });
    expect(result.statusContent).toContain('phase: "build"');
    expect(result.statusContent).toContain('current_package: "P1"');
  });

  it("advances from completed package test to the next package build", () => {
    const result = advanceLoopAfterPhaseSuccess({
      loopState: {
        id: "loop-1",
        phase: "test",
        tier: "standard",
        totalIterations: 3,
        consecutiveFailures: 0,
        lastReviewResult: "passed",
      },
      statusContent: `---
phase: "test"
loop_iteration: 3
current_package: "P1"
completed_packages: ""
next_package: "P2"
package_count: 2
---
`,
      executionPackages: PACKAGES,
      now: "2026-06-08T00:01:00.000Z",
    });

    expect(result.nextForgeArgs).toBe("build --package P2");
    expect(result.loopState.phase).toBe("build");
    expect(result.loopState.packageState?.completedPackages).toEqual(["P1"]);
    expect(result.statusContent).toContain('completed_packages: "P1"');
    expect(result.statusContent).toContain('current_package: "P2"');
  });

  it("moves to feature-scoped ship after the last package test succeeds", () => {
    const result = advanceLoopAfterPhaseSuccess({
      loopState: {
        id: "loop-1",
        phase: "test",
        tier: "standard",
        totalIterations: 7,
        consecutiveFailures: 0,
        lastReviewResult: "passed",
      },
      statusContent: `---
phase: "test"
loop_iteration: 7
current_package: "P2"
completed_packages: "P1"
next_package: ""
package_count: 2
---
`,
      executionPackages: PACKAGES,
      now: "2026-06-08T00:02:00.000Z",
    });

    expect(result.nextForgeArgs).toBe("ship");
    expect(result.loopState.phase).toBe("ship");
    expect(result.loopState.packageState).toEqual({
      currentPackage: undefined,
      completedPackages: ["P1", "P2"],
      nextPackage: undefined,
      packageCount: 2,
    });
    expect(result.statusContent).not.toContain("current_package");
    expect(result.statusContent).toContain('completed_packages: "P1,P2"');
  });

  it("keeps review failures inside the current package", () => {
    const result = advanceLoopAfterPhaseSuccess({
      loopState: {
        id: "loop-1",
        phase: "review",
        tier: "standard",
        totalIterations: 2,
        consecutiveFailures: 0,
        lastReviewResult: "failed-p1",
      },
      statusContent: `---
phase: "review"
loop_iteration: 2
current_package: "P1"
completed_packages: ""
next_package: "P2"
package_count: 2
---
`,
      executionPackages: PACKAGES,
      reviewResult: "failed-p1",
    });

    expect(result.nextForgeArgs).toBe("build --package P1");
    expect(result.loopState.phase).toBe("build");
    expect(result.loopState.packageState?.completedPackages).toEqual([]);
  });

  it("halts when the current package dependency boundary is invalid", () => {
    const result = advanceLoopAfterPhaseSuccess({
      loopState: {
        id: "loop-1",
        phase: "build",
        tier: "standard",
        totalIterations: 1,
        consecutiveFailures: 0,
        lastReviewResult: "not-run",
      },
      statusContent: `---
phase: "build"
loop_iteration: 1
current_package: "P2"
completed_packages: ""
package_count: 2
---
`,
      executionPackages: PACKAGES,
    });

    expect(result.nextForgeArgs).toBeNull();
    expect(result.loopState.phase).toBe("halted");
    expect(result.loopState.haltReason).toContain("P1");
    expect(result.statusContent).toContain('phase: "halted"');
  });
});
