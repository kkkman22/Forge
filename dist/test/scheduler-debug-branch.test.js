/**
 * Tests for skill-scheduler debug phase branch (dynamic-replan-loop R2).
 *
 * Covers the 4 routing paths + missing-field fallback + non-debug isolation.
 * The debug branch reads SchedulerInput.debugStatus / debugFailureClass
 * (populated by the caller from .forge/debug/<slug>.md frontmatter) and
 * routes to build/plan/aborted accordingly.
 *
 * **Pins: dynamic-replan-loop R2-AC1~AC4.**
 */
import { describe, expect, it } from "vitest";
import { determineNextSkill } from "../src/skill-scheduler.js";
const BASE_INPUT = {
    reviewFixAttempts: 0,
    maxReviewFixAttempts: 3,
};
describe("scheduler debug branch — 4 routing paths [R2-AC1]", () => {
    it("resolved + fixable_bug → build (existing path preserved)", () => {
        const result = determineNextSkill({
            ...BASE_INPUT,
            currentPhase: "debug",
            debugStatus: "resolved",
            debugFailureClass: "fixable_bug",
        });
        expect(result.nextPhase).toBe("build");
    });
    it("resolved + assumption_invalidated → plan (triggers replan)", () => {
        const result = determineNextSkill({
            ...BASE_INPUT,
            currentPhase: "debug",
            debugStatus: "resolved",
            debugFailureClass: "assumption_invalidated",
            debugInvalidatedAssumptions: ["UserService API exists"],
        });
        expect(result.nextPhase).toBe("plan");
        expect(result.reason).toMatch(/replan|invalidat/i);
    });
    it("resolved + environmental → build (with env warning in reason)", () => {
        const result = determineNextSkill({
            ...BASE_INPUT,
            currentPhase: "debug",
            debugStatus: "resolved",
            debugFailureClass: "environmental",
        });
        expect(result.nextPhase).toBe("build");
        expect(result.reason).toMatch(/env/i);
    });
    it("abandoned → aborted", () => {
        const result = determineNextSkill({
            ...BASE_INPUT,
            currentPhase: "debug",
            debugStatus: "abandoned",
        });
        expect(result.nextPhase).toBe("aborted");
    });
});
describe("scheduler debug branch — missing-field fallback [R2 conservative]", () => {
    it("debug phase with no debug fields → build (conservative, never blocks)", () => {
        const result = determineNextSkill({
            ...BASE_INPUT,
            currentPhase: "debug",
        });
        expect(result.nextPhase).toBe("build");
    });
    it("debugStatus resolved but failureClass missing → build (defaults fixable_bug)", () => {
        const result = determineNextSkill({
            ...BASE_INPUT,
            currentPhase: "debug",
            debugStatus: "resolved",
        });
        expect(result.nextPhase).toBe("build");
    });
});
describe("scheduler debug branch — non-debug isolation [R2-AC3]", () => {
    it("plan phase is unaffected by debug fields", () => {
        const result = determineNextSkill({
            ...BASE_INPUT,
            currentPhase: "plan",
            planStatus: "approved",
            debugFailureClass: "assumption_invalidated",
        });
        expect(result.nextPhase).toBe("build");
    });
    it("build phase is unaffected by debug fields", () => {
        const result = determineNextSkill({
            ...BASE_INPUT,
            currentPhase: "build",
            hasIncompleteTasks: false,
            debugFailureClass: "assumption_invalidated",
        });
        expect(result.nextPhase).toBe("review");
    });
    it("review fail → build (existing review-fix loop intact)", () => {
        const result = determineNextSkill({
            ...BASE_INPUT,
            currentPhase: "review",
            reviewResult: "fail",
            debugStatus: "resolved",
        });
        expect(result.nextPhase).toBe("build");
    });
});
//# sourceMappingURL=scheduler-debug-branch.test.js.map