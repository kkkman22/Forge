import { describe, expect, it } from "vitest";
import { getNextPackageTransition } from "../../src/loop/phase-transitions.js";
describe("getNextPackageTransition", () => {
    it("keeps package-scoped builds inside review/test before advancing packages", () => {
        const result = getNextPackageTransition({
            tier: "standard",
            currentPhase: "build",
            currentPackage: "P1",
            completedPackages: [],
            packageIds: ["P1", "P2"],
        });
        expect(result).toEqual({
            phase: "review",
            currentPackage: "P1",
            completedPackages: [],
            nextPackage: "P2",
            completed: false,
        });
    });
    it("marks current package complete after package-scoped test and schedules next package build", () => {
        const result = getNextPackageTransition({
            tier: "standard",
            currentPhase: "test",
            currentPackage: "P1",
            completedPackages: [],
            packageIds: ["P1", "P2"],
        });
        expect(result).toEqual({
            phase: "build",
            currentPackage: "P2",
            completedPackages: ["P1"],
            nextPackage: null,
            completed: false,
        });
    });
    it("moves to ship after the last package completes", () => {
        const result = getNextPackageTransition({
            tier: "full",
            currentPhase: "test",
            currentPackage: "P2",
            completedPackages: ["P1"],
            packageIds: ["P1", "P2"],
        });
        expect(result).toEqual({
            phase: "ship",
            currentPackage: null,
            completedPackages: ["P1", "P2"],
            nextPackage: null,
            completed: true,
        });
    });
    it("rolls package review failures back to build without completing the package", () => {
        const result = getNextPackageTransition({
            tier: "standard",
            currentPhase: "review",
            reviewResult: "failed-p1",
            currentPackage: "P1",
            completedPackages: [],
            packageIds: ["P1", "P2"],
        });
        expect(result.phase).toBe("build");
        expect(result.currentPackage).toBe("P1");
        expect(result.completedPackages).toEqual([]);
        expect(result.nextPackage).toBe("P2");
        expect(result.completed).toBe(false);
    });
    it("halts when the current package depends on an incomplete earlier package", () => {
        const result = getNextPackageTransition({
            tier: "standard",
            currentPhase: "build",
            currentPackage: "P2",
            completedPackages: [],
            packageIds: ["P1", "P2"],
            packageDependencies: { P2: ["P1"] },
        });
        expect(result.phase).toBe("halted");
        expect(result.reason).toContain("P1");
    });
});
//# sourceMappingURL=package-iteration.test.js.map