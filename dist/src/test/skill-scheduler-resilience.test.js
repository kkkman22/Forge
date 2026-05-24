/**
 * Skill Scheduler Resilience tests — undefined input handling.
 *
 * Property 2: For any SchedulerInput with undefined optional fields,
 * determineNextSkill SHALL NEVER return a phase later than the current phase.
 */
import { describe, expect, it } from "vitest";
import { determineNextSkill, getCommandSequence } from "../src/skill-scheduler.js";
// ---------------------------------------------------------------------------
// Conservative degradation for undefined inputs
// ---------------------------------------------------------------------------
describe("determineNextSkill — undefined hasIncompleteTasks", () => {
    const baseInput = {
        tier: "standard",
        planStatus: "approved",
        reviewFixAttempts: 0,
        maxReviewFixAttempts: 3,
    };
    it("build phase + undefined hasIncompleteTasks → stays in build (not review)", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "build",
            hasIncompleteTasks: undefined,
        });
        // undefined means "don't know" → conservative: assume incomplete
        expect(result.nextPhase).toBe("build");
        expect(result.reason).toMatch(/incomplete/i);
    });
    it("build phase + false hasIncompleteTasks → proceeds to review", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "build",
            hasIncompleteTasks: false,
        });
        expect(result.nextPhase).toBe("review");
    });
    it("build phase + true hasIncompleteTasks → stays in build", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "build",
            hasIncompleteTasks: true,
        });
        expect(result.nextPhase).toBe("build");
    });
    it("build-light phase + undefined hasIncompleteTasks → stays in build-light", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "build-light",
            hasIncompleteTasks: undefined,
        });
        expect(result.nextPhase).toBe("build-light");
    });
    it("refactor-apply phase + undefined hasIncompleteTasks → stays in refactor-apply", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "refactor-apply",
            hasIncompleteTasks: undefined,
        });
        expect(result.nextPhase).toBe("refactor-apply");
    });
    it("fix-apply phase + undefined hasIncompleteTasks → stays in fix-apply", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "fix-apply",
            hasIncompleteTasks: undefined,
        });
        expect(result.nextPhase).toBe("fix-apply");
    });
});
describe("determineNextSkill — undefined reviewResult", () => {
    const baseInput = {
        tier: "standard",
        planStatus: "approved",
        reviewFixAttempts: 0,
        maxReviewFixAttempts: 3,
    };
    it("review phase + undefined reviewResult → stays in review", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "review",
            reviewResult: undefined,
        });
        expect(result.nextPhase).toBe("review");
    });
    it("review phase + pass reviewResult → proceeds to test", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "review",
            reviewResult: "pass",
        });
        expect(result.nextPhase).toBe("test");
    });
    it("review phase + fail reviewResult → goes back to build", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "review",
            reviewResult: "fail",
        });
        expect(result.nextPhase).toBe("build");
    });
});
describe("determineNextSkill — undefined testPassed", () => {
    const baseInput = {
        tier: "standard",
        planStatus: "approved",
        reviewFixAttempts: 0,
        maxReviewFixAttempts: 3,
        reviewResult: "pass",
    };
    it("test phase + undefined testPassed → stays in test", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "test",
            testPassed: undefined,
        });
        expect(result.nextPhase).toBe("test");
    });
    it("test phase + true testPassed → proceeds to ship", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "test",
            testPassed: true,
        });
        expect(result.nextPhase).toBe("ship");
    });
    it("test phase + false testPassed → stays in test", () => {
        const result = determineNextSkill({
            ...baseInput,
            currentPhase: "test",
            testPassed: false,
        });
        expect(result.nextPhase).toBe("test");
    });
});
describe("determineNextSkill — Property 2: undefined never skips ahead", () => {
    const sequence = getCommandSequence("standard");
    function phaseIndex(phase) {
        return sequence.indexOf(phase);
    }
    it("for build phase, undefined hasIncompleteTasks never advances past build", () => {
        const result = determineNextSkill({
            currentPhase: "build",
            tier: "standard",
            hasIncompleteTasks: undefined,
            reviewFixAttempts: 0,
            maxReviewFixAttempts: 3,
        });
        expect(phaseIndex(result.nextPhase)).toBeLessThanOrEqual(phaseIndex("build"));
    });
    it("for review phase, undefined reviewResult never advances past review", () => {
        const result = determineNextSkill({
            currentPhase: "review",
            tier: "standard",
            reviewResult: undefined,
            reviewFixAttempts: 0,
            maxReviewFixAttempts: 3,
        });
        expect(phaseIndex(result.nextPhase)).toBeLessThanOrEqual(phaseIndex("review"));
    });
    it("for test phase, undefined testPassed never advances past test", () => {
        const result = determineNextSkill({
            currentPhase: "test",
            tier: "standard",
            testPassed: undefined,
            reviewFixAttempts: 0,
            maxReviewFixAttempts: 3,
        });
        expect(phaseIndex(result.nextPhase)).toBeLessThanOrEqual(phaseIndex("test"));
    });
});
//# sourceMappingURL=skill-scheduler-resilience.test.js.map