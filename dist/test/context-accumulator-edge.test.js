/**
 * Unit tests for buildSkillAwarePrompt edge cases.
 *
 * Covers example-based scenarios that complement the property-based tests
 * in context-accumulator.property.test.ts:
 *   - Build phase prompt includes task context when provided
 *   - Review phase prompt includes P0/P1 issue details when fixIssues provided
 *   - Empty phase triggers routing analysis instruction
 *   - PUA context injection at L3/L4 includes Proactive Initiative Checklist
 *
 * **Validates: Requirements 1.3, 1.4, 1.5**
 */
import { describe, expect, it } from "vitest";
import { buildSkillAwarePrompt } from "../src/context-accumulator.js";
import { PROACTIVE_INITIATIVE_CHECKLIST } from "../src/pua-engine.js";
// ---------------------------------------------------------------------------
// Shared base params helper
// ---------------------------------------------------------------------------
function makeBase() {
    return {
        iteration: 3,
        runId: "test-run-abc",
        objective: "Implement user authentication",
        notesContent: "Previous iterations completed database setup.",
    };
}
// ---------------------------------------------------------------------------
// Build phase — task context inclusion
// ---------------------------------------------------------------------------
describe("buildSkillAwarePrompt: build phase with task context", () => {
    /**
     * **Validates: Requirements 1.3**
     */
    it("includes taskType, projectPhase, and workNature when provided", () => {
        const params = {
            base: makeBase(),
            skill: {
                phase: "build",
                tier: "standard",
                taskType: "backend",
                projectPhase: "iteration",
                workNature: "feature",
            },
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).toContain("Current phase: build");
        expect(output).toContain("Tier: standard");
        expect(output).toContain("Task type: backend");
        expect(output).toContain("Project phase: iteration");
        expect(output).toContain("Work nature: feature");
        expect(output).toContain("forge-build");
    });
    /**
     * **Validates: Requirements 1.3**
     */
    it("includes hints when provided for build phase", () => {
        const params = {
            base: makeBase(),
            skill: {
                phase: "build",
                tier: "standard",
                hints: [
                    { command: "build", tag: "tdd-first", description: "Write tests before implementation" },
                    { command: "build", tag: "api-contract", description: "Validate API contract" },
                ],
            },
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).toContain("### Hints");
        expect(output).toContain("[build] tdd-first: Write tests before implementation");
        expect(output).toContain("[build] api-contract: Validate API contract");
    });
    /**
     * **Validates: Requirements 1.5**
     */
    it("always includes mode: autonomous directive for build phase", () => {
        const params = {
            base: makeBase(),
            skill: { phase: "build", tier: "light" },
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).toContain("mode: autonomous");
        expect(output).toContain("Skip all confirmation points");
    });
});
// ---------------------------------------------------------------------------
// Review phase — P0/P1 issue details
// ---------------------------------------------------------------------------
describe("buildSkillAwarePrompt: review phase with fixIssues", () => {
    /**
     * **Validates: Requirements 1.4**
     */
    it("includes P0/P1 issue details in Issues to Fix section", () => {
        const params = {
            base: makeBase(),
            skill: {
                phase: "review",
                tier: "standard",
                fixIssues: [
                    { severity: "P0", description: "SQL injection vulnerability in login endpoint" },
                    { severity: "P1", description: "Missing input validation on email field" },
                ],
            },
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).toContain("### Issues to Fix");
        expect(output).toContain("P0: SQL injection vulnerability in login endpoint");
        expect(output).toContain("P1: Missing input validation on email field");
        expect(output).toContain("Current phase: review");
    });
    /**
     * **Validates: Requirements 1.4**
     */
    it("does not include Issues to Fix section when fixIssues is empty", () => {
        const params = {
            base: makeBase(),
            skill: {
                phase: "review",
                tier: "standard",
                fixIssues: [],
            },
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).not.toContain("### Issues to Fix");
    });
    /**
     * **Validates: Requirements 1.4**
     */
    it("does not include Issues to Fix section when fixIssues is undefined", () => {
        const params = {
            base: makeBase(),
            skill: {
                phase: "review",
                tier: "full",
            },
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).not.toContain("### Issues to Fix");
    });
});
// ---------------------------------------------------------------------------
// Empty phase — routing analysis instruction
// ---------------------------------------------------------------------------
describe("buildSkillAwarePrompt: empty phase triggers routing analysis", () => {
    /**
     * **Validates: Requirements 1.5**
     */
    it("instructs routing analysis when phase is empty string", () => {
        const params = {
            base: makeBase(),
            skill: {
                phase: "",
                tier: "standard",
            },
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).toContain("No phase is set");
        expect(output).toContain("forge-router");
        expect(output).toContain("routing analysis");
        expect(output).not.toContain("Current phase:");
    });
    /**
     * **Validates: Requirements 1.5**
     */
    it("instructs routing analysis when phase is whitespace-only", () => {
        const params = {
            base: makeBase(),
            skill: {
                phase: "   ",
                tier: "light",
            },
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).toContain("No phase is set");
        expect(output).toContain("forge-router");
    });
    /**
     * **Validates: Requirements 1.5**
     */
    it("still includes tier and mode: autonomous when phase is empty", () => {
        const params = {
            base: makeBase(),
            skill: {
                phase: "",
                tier: "full",
            },
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).toContain("Tier: full");
        expect(output).toContain("mode: autonomous");
    });
});
// ---------------------------------------------------------------------------
// PUA context injection — L3/L4 includes Proactive Initiative Checklist
// ---------------------------------------------------------------------------
describe("buildSkillAwarePrompt: PUA context injection", () => {
    /**
     * **Validates: Requirements 1.5**
     */
    it("includes PUA Quality Engine section when puaContext is provided", () => {
        const puaContext = {
            pressureLevel: "L1",
            methodology: "huawei-rca",
            failurePattern: null,
            stallResponse: "remind",
            pressurePrompt: "You have failed once. Switch to a different approach.",
        };
        const params = {
            base: makeBase(),
            skill: { phase: "build", tier: "standard" },
            puaContext,
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).toContain("## PUA Quality Engine");
        expect(output).toContain("You have failed once. Switch to a different approach.");
    });
    /**
     * **Validates: Requirements 1.5**
     */
    it("includes Proactive Initiative Checklist at L3 pressure level", () => {
        const puaContext = {
            pressureLevel: "L3",
            methodology: "alibaba-closure",
            failurePattern: "spinning",
            stallResponse: "reassess",
            pressurePrompt: "L3 pressure prompt content here.",
        };
        const params = {
            base: makeBase(),
            skill: { phase: "build", tier: "standard" },
            puaContext,
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).toContain("## PUA Quality Engine");
        expect(output).toContain("L3 pressure prompt content here.");
        expect(output).toContain(PROACTIVE_INITIATIVE_CHECKLIST);
        expect(output).toContain("Proactive Initiative Checklist");
    });
    /**
     * **Validates: Requirements 1.5**
     */
    it("includes Proactive Initiative Checklist at L4 pressure level", () => {
        const puaContext = {
            pressureLevel: "L4",
            methodology: "netflix-keeper",
            failurePattern: "giving-up",
            stallResponse: "force-pivot",
            pressurePrompt: "L4 desperation mode activated.",
        };
        const params = {
            base: makeBase(),
            skill: { phase: "review", tier: "full" },
            puaContext,
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).toContain("## PUA Quality Engine");
        expect(output).toContain("L4 desperation mode activated.");
        expect(output).toContain(PROACTIVE_INITIATIVE_CHECKLIST);
    });
    /**
     * **Validates: Requirements 1.5**
     */
    it("does NOT include Proactive Initiative Checklist at L0/L1/L2", () => {
        for (const level of ["L0", "L1", "L2"]) {
            const puaContext = {
                pressureLevel: level,
                methodology: null,
                failurePattern: null,
                stallResponse: null,
                pressurePrompt: `Pressure prompt for ${level}.`,
            };
            const params = {
                base: makeBase(),
                skill: { phase: "build", tier: "standard" },
                puaContext,
            };
            const output = buildSkillAwarePrompt(params);
            expect(output).toContain("## PUA Quality Engine");
            expect(output).not.toContain(PROACTIVE_INITIATIVE_CHECKLIST);
        }
    });
    /**
     * **Validates: Requirements 1.5**
     */
    it("does not include PUA section when puaContext is undefined", () => {
        const params = {
            base: makeBase(),
            skill: { phase: "build", tier: "standard" },
        };
        const output = buildSkillAwarePrompt(params);
        expect(output).not.toContain("## PUA Quality Engine");
        expect(output).not.toContain("Proactive Initiative Checklist");
    });
});
//# sourceMappingURL=context-accumulator-edge.test.js.map