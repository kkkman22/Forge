/**
 * Unit tests for branch-gate module — runBranchGate, DEFAULT_SEVERITY.
 */
import { describe, it, expect } from "vitest";
import { runBranchGate, DEFAULT_SEVERITY, } from "../src/branch-gate.js";
const baseInput = (overrides = {}) => ({
    skill: "build",
    mode: "interactive",
    currentBranch: "feature/my-task",
    currentTask: "my-task",
    pendingDeliveries: [],
    alreadyCheckedThisPhase: false,
    isCleanTree: true,
    ...overrides,
});
describe("runBranchGate", () => {
    it("returns passed when branch topic matches task", () => {
        const result = runBranchGate(baseInput());
        expect(result).toEqual({ kind: "passed" });
    });
    it("returns skipped when alreadyCheckedThisPhase is true", () => {
        const result = runBranchGate(baseInput({ alreadyCheckedThisPhase: true }));
        expect(result).toEqual({ kind: "skipped", reason: "already_checked_this_phase" });
    });
    it("returns skipped when currentTask is null", () => {
        const result = runBranchGate(baseInput({ currentTask: null }));
        expect(result).toEqual({ kind: "skipped", reason: "no_current_task" });
    });
    it("returns passed when on main branch (delegates to global protection)", () => {
        const result = runBranchGate(baseInput({ currentBranch: "main" }));
        expect(result).toEqual({ kind: "passed" });
    });
    it("returns passed when on master branch", () => {
        const result = runBranchGate(baseInput({ currentBranch: "master" }));
        expect(result).toEqual({ kind: "passed" });
    });
    it("returns blocked when branch topic mismatches and severity is block", () => {
        const result = runBranchGate(baseInput({
            currentBranch: "feature/other-task",
            currentTask: "my-task",
            skill: "build",
        }));
        expect(result.kind).toBe("blocked");
        if (result.kind === "blocked") {
            expect(result.reasons.length).toBeGreaterThan(0);
            expect(result.suggestedBranch).toBe("feature/my-task");
        }
    });
    it("returns warned when branch topic mismatches and severity is warn", () => {
        const result = runBranchGate(baseInput({
            currentBranch: "feature/other-task",
            currentTask: "my-task",
            skill: "plan",
        }));
        expect(result.kind).toBe("warned");
        if (result.kind === "warned") {
            expect(result.reasons.length).toBeGreaterThan(0);
            expect(result.suggestedBranch).toBe("feature/my-task");
        }
    });
    it("returns blocked when branch format is invalid (not feature/forge)", () => {
        const result = runBranchGate(baseInput({
            currentBranch: "random-branch",
            currentTask: "my-task",
        }));
        expect(result.kind).toBe("blocked");
        if (result.kind === "blocked") {
            expect(result.reasons.some(r => r.includes("不符合"))).toBe(true);
        }
    });
    it("returns auto_fixed when autonomous + topic mismatch + clean tree + valid branch", () => {
        const result = runBranchGate(baseInput({
            mode: "autonomous",
            currentBranch: "forge/other-task",
            currentTask: "my-task",
            isCleanTree: true,
        }));
        expect(result.kind).toBe("auto_fixed");
        if (result.kind === "auto_fixed") {
            expect(result.previousBranch).toBe("forge/other-task");
            expect(result.newBranch).toBe("feature/my-task");
        }
    });
    it("returns blocked when autonomous + topic mismatch + dirty tree", () => {
        const result = runBranchGate(baseInput({
            mode: "autonomous",
            currentBranch: "feature/other-task",
            currentTask: "my-task",
            isCleanTree: false,
            skill: "build",
        }));
        expect(result.kind).toBe("blocked");
    });
    it("returns warned when unshipped branches detected", () => {
        const deliveries = [
            { branchName: "feature/old-task", topic: "old-task", timestamp: Date.now() - 86400000 },
        ];
        const result = runBranchGate(baseInput({ pendingDeliveries: deliveries }));
        expect(result.kind).toBe("warned");
        if (result.kind === "warned") {
            expect(result.reasons.some(r => r.includes("未完成"))).toBe(true);
        }
    });
    it("severityOverride overrides default severity", () => {
        const result = runBranchGate(baseInput({
            currentBranch: "feature/other-task",
            currentTask: "my-task",
            skill: "debug",
            severityOverride: "block",
        }));
        expect(result.kind).toBe("blocked");
    });
    it("warn severity with format-invalid branch returns warned not blocked", () => {
        const result = runBranchGate(baseInput({
            currentBranch: "random-branch",
            currentTask: "my-task",
            skill: "plan",
        }));
        expect(result.kind).toBe("warned");
    });
});
describe("DEFAULT_SEVERITY", () => {
    it("maps every skill to a severity", () => {
        const skills = ["plan", "build", "review", "test", "ship", "debug", "learn"];
        for (const skill of skills) {
            expect(DEFAULT_SEVERITY[skill]).toBeDefined();
        }
    });
    it("build, review, test, ship are block", () => {
        expect(DEFAULT_SEVERITY.build).toBe("block");
        expect(DEFAULT_SEVERITY.review).toBe("block");
        expect(DEFAULT_SEVERITY.test).toBe("block");
        expect(DEFAULT_SEVERITY.ship).toBe("block");
    });
    it("plan, debug, learn are warn", () => {
        expect(DEFAULT_SEVERITY.plan).toBe("warn");
        expect(DEFAULT_SEVERITY.debug).toBe("warn");
        expect(DEFAULT_SEVERITY.learn).toBe("warn");
    });
});
//# sourceMappingURL=branch-gate.test.js.map