/**
 * Property-based tests for P3: Conditional SKILL Loading (build-light phase).
 *
 * Feature: token-language-optimization
 * Validates: design.md Correctness Properties 1-4
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildSkillAwarePrompt } from "../src/context-accumulator.js";
import { determineNextSkill, getCommandSequence, shouldCommitForPhase, } from "../src/skill-scheduler.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const KNOWN_TIERS = [
    "light",
    "standard",
    "full",
    "refactor_light",
    "refactor_standard",
    "fix_light",
    "fix_standard",
];
/** Baseline command sequences captured before P3 changes. */
const BASELINE_SEQUENCES = {
    standard: ["plan", "build", "review", "test", "ship"],
    full: ["plan", "build", "review", "test", "ship", "learn"],
    refactor_light: ["refactor-apply", "review"],
    refactor_standard: ["refactor-scan", "refactor-apply", "review", "test", "ship"],
    fix_light: ["fix-apply", "review"],
    fix_standard: ["fix-analyze", "fix-apply", "review", "test", "ship"],
};
function makeInput(overrides = {}) {
    return {
        reviewFixAttempts: 0,
        maxReviewFixAttempts: 3,
        ...overrides,
    };
}
function makeSkillPromptParams(phase) {
    return {
        base: {
            iteration: 1,
            runId: "test-run",
            objective: "test objective",
            notesContent: "",
        },
        skill: {
            phase,
            tier: "standard",
        },
    };
}
// ---------------------------------------------------------------------------
// Property 1: Command sequence correctness
// ---------------------------------------------------------------------------
describe("Property 1: Light tier command sequence updated, all others unchanged", () => {
    it("light tier returns [build-light, review]", () => {
        fc.assert(fc.property(fc.constant(undefined), () => {
            expect(getCommandSequence("light")).toEqual(["build-light", "review"]);
        }));
    });
    it("other known tiers return unchanged baseline sequences", () => {
        const otherTiers = KNOWN_TIERS.filter((t) => t !== "light");
        fc.assert(fc.property(fc.constantFrom(...otherTiers), (tier) => {
            expect(getCommandSequence(tier)).toEqual(BASELINE_SEQUENCES[tier]);
        }));
    });
    it("unknown tiers default to standard sequence", () => {
        fc.assert(fc.property(fc.string().filter((s) => !KNOWN_TIERS.includes(s)), (unknownTier) => {
            expect(getCommandSequence(unknownTier)).toEqual(BASELINE_SEQUENCES.standard);
        }));
    });
});
// ---------------------------------------------------------------------------
// Property 2: Build-light phase transitions mirror build phase
// ---------------------------------------------------------------------------
describe("Property 2: Build-light transitions mirror build transitions", () => {
    it("returns build-light when hasIncompleteTasks=true", () => {
        fc.assert(fc.property(fc.record({
            reviewFixAttempts: fc.integer({ min: 0, max: 10 }),
            maxReviewFixAttempts: fc.integer({ min: 1, max: 20 }),
        }), (extra) => {
            const input = makeInput({
                ...extra,
                currentPhase: "build-light",
                hasIncompleteTasks: true,
            });
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("build-light");
        }));
    });
    it("returns review when hasIncompleteTasks=false or undefined", () => {
        fc.assert(fc.property(fc.record({
            reviewFixAttempts: fc.integer({ min: 0, max: 10 }),
            maxReviewFixAttempts: fc.integer({ min: 1, max: 20 }),
            hasIncompleteTasks: fc.oneof(fc.constant(false), fc.constant(undefined)),
        }), (extra) => {
            const input = makeInput({
                ...extra,
                currentPhase: "build-light",
            });
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("review");
        }));
    });
});
// ---------------------------------------------------------------------------
// Property 3: Build-light is a commitable phase
// ---------------------------------------------------------------------------
describe("Property 3: shouldCommitForPhase(build-light, success) === success", () => {
    it("returns the success boolean for any boolean value", () => {
        fc.assert(fc.property(fc.boolean(), (success) => {
            expect(shouldCommitForPhase("build-light", success)).toBe(success);
        }));
    });
});
// ---------------------------------------------------------------------------
// Property 4: Phase-to-SKILL name mapping via string interpolation
// ---------------------------------------------------------------------------
describe("Property 4: buildSkillAwarePrompt output contains forge-{phase}", () => {
    it("output contains forge-{phase} for any non-empty phase string", () => {
        fc.assert(fc.property(fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), (phase) => {
            const prompt = buildSkillAwarePrompt(makeSkillPromptParams(phase));
            expect(prompt).toContain(`forge-${phase}`);
        }));
    });
});
//# sourceMappingURL=skill-scheduler-p3.property.test.js.map