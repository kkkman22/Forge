/**
 * Integration tests — verify cross-module interaction between
 * SkillScheduler + QualityGate + StatusFile + ContextAccumulator.
 *
 * These are example-based integration tests using pure functions only (no mocks).
 * Each test simulates a realistic multi-step scenario.
 *
 * **Validates: Requirements 4.1, 4.2, 4.5, 4.7**
 */
import { describe, expect, it } from "vitest";
import { buildSkillAwarePrompt } from "../src/context-accumulator.js";
import { evaluateReviewGate } from "../src/quality-gate.js";
import { determineNextSkill } from "../src/skill-scheduler.js";
import { clearLoopFields, extractLoopFields, updateIterationStatus, writeLoopFields, } from "../src/status-file-ext.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Build a SchedulerInput with sensible defaults. */
function makeInput(overrides = {}) {
    return {
        reviewFixAttempts: 0,
        maxReviewFixAttempts: 3,
        ...overrides,
    };
}
/** Build a review report with the given P0/P1 counts. */
function buildReviewContent(p0, p1) {
    const lines = ["---", `p0_count: ${p0}`, `p1_count: ${p1}`, "---"];
    if (p0 > 0) {
        lines.push("## P0 Issues", "");
        for (let i = 1; i <= p0; i++) {
            lines.push(`- Critical issue ${i}`);
        }
        lines.push("");
    }
    if (p1 > 0) {
        lines.push("## P1 Issues", "");
        for (let i = 1; i <= p1; i++) {
            lines.push(`- Important issue ${i}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
/** Base prompt params reused across tests. */
const basePromptParams = {
    iteration: 1,
    runId: "integration-test-run",
    objective: "Build a user authentication system",
    notesContent: "# Run: integration-test-run\n\n## Iteration Log\n",
};
// ---------------------------------------------------------------------------
// 1. Full sequence simulation
// ---------------------------------------------------------------------------
describe("Full sequence simulation: router → plan → build → review → test → ship", () => {
    /**
     * Validates: Requirements 4.1, 4.2, 4.7
     *
     * Simulates a complete standard-tier workflow by calling
     * determineNextSkill() with evolving state at each phase transition.
     */
    it("walks through the complete standard-tier phase sequence", () => {
        // Phase 1: No phase set → should route to "router"
        const step1 = determineNextSkill(makeInput({ currentPhase: undefined }));
        expect(step1.nextPhase).toBe("router");
        // Phase 2: Router done → should go to "plan"
        // (After router completes, currentPhase would be set to "plan" by the driver)
        const step2 = determineNextSkill(makeInput({ currentPhase: "plan", planStatus: "draft" }));
        expect(step2.nextPhase).toBe("plan");
        // Phase 3: Plan approved → should go to "build"
        const step3 = determineNextSkill(makeInput({ currentPhase: "plan", planStatus: "approved" }));
        expect(step3.nextPhase).toBe("build");
        // Phase 4: Build with incomplete tasks → stay in "build"
        const step4 = determineNextSkill(makeInput({ currentPhase: "build", hasIncompleteTasks: true }));
        expect(step4.nextPhase).toBe("build");
        // Phase 5: Build with all tasks complete → go to "review"
        const step5 = determineNextSkill(makeInput({ currentPhase: "build", hasIncompleteTasks: false }));
        expect(step5.nextPhase).toBe("review");
        // Phase 6: Review passed → go to "test"
        const step6 = determineNextSkill(makeInput({ currentPhase: "review", reviewResult: "pass" }));
        expect(step6.nextPhase).toBe("test");
        // Phase 7: Tests passed → go to "ship"
        const step7 = determineNextSkill(makeInput({ currentPhase: "test", testPassed: true }));
        expect(step7.nextPhase).toBe("ship");
        // Phase 8: Ship complete (standard tier) → "completed"
        const step8 = determineNextSkill(makeInput({ currentPhase: "ship", tier: "standard" }));
        expect(step8.nextPhase).toBe("completed");
    });
    it("walks through the full-tier sequence including learn phase", () => {
        // Ship with full tier → should go to "learn"
        const shipResult = determineNextSkill(makeInput({ currentPhase: "ship", tier: "full" }));
        expect(shipResult.nextPhase).toBe("learn");
        // Learn → completed
        const learnResult = determineNextSkill(makeInput({ currentPhase: "learn" }));
        expect(learnResult.nextPhase).toBe("completed");
    });
});
// ---------------------------------------------------------------------------
// 2. Fix loop simulation
// ---------------------------------------------------------------------------
describe("Fix loop simulation: review blocked → build fix → review pass", () => {
    /**
     * Validates: Requirements 4.5
     *
     * Simulates a review failure triggering a fix loop, then a successful
     * re-review, using both determineNextSkill() and evaluateReviewGate().
     */
    it("enters fix loop on review failure and exits on review pass", () => {
        // Step 1: Review finds P0 issues → gate is blocked
        const blockedReview = buildReviewContent(1, 0);
        const gateResult = evaluateReviewGate(blockedReview);
        expect(gateResult.status).toBe("blocked");
        expect(gateResult.issues).toBeDefined();
        expect(gateResult.issues?.length).toBeGreaterThan(0);
        // Step 2: Scheduler sees review fail → routes back to build (fix loop)
        const fixStep = determineNextSkill(makeInput({
            currentPhase: "review",
            reviewResult: "fail",
            reviewFixAttempts: 0,
        }));
        expect(fixStep.nextPhase).toBe("build");
        expect(fixStep.reason).toContain("fix");
        // Step 3: Build fix completes, all tasks done → back to review
        const reReviewStep = determineNextSkill(makeInput({
            currentPhase: "build",
            hasIncompleteTasks: false,
            reviewFixAttempts: 1,
        }));
        expect(reReviewStep.nextPhase).toBe("review");
        // Step 4: Second review passes → gate passes
        const passedReview = buildReviewContent(0, 0);
        const passGateResult = evaluateReviewGate(passedReview);
        expect(passGateResult.status).toBe("passed");
        // Step 5: Scheduler sees review pass → moves to test
        const testStep = determineNextSkill(makeInput({
            currentPhase: "review",
            reviewResult: "pass",
            reviewFixAttempts: 1,
        }));
        expect(testStep.nextPhase).toBe("test");
    });
    it("handles multiple fix loop iterations before passing", () => {
        // Two consecutive review failures, then a pass
        for (let attempt = 0; attempt < 2; attempt++) {
            const fixStep = determineNextSkill(makeInput({
                currentPhase: "review",
                reviewResult: "fail",
                reviewFixAttempts: attempt,
            }));
            expect(fixStep.nextPhase).toBe("build");
        }
        // Third attempt: review passes
        const passStep = determineNextSkill(makeInput({
            currentPhase: "review",
            reviewResult: "pass",
            reviewFixAttempts: 2,
        }));
        expect(passStep.nextPhase).toBe("test");
    });
});
// ---------------------------------------------------------------------------
// 3. Circuit breaker simulation
// ---------------------------------------------------------------------------
describe("Circuit breaker simulation: consecutive review failures exceed max", () => {
    /**
     * Validates: Requirements 4.5 (circuit breaker aspect)
     *
     * Simulates consecutive review failures exceeding the max retry count,
     * verifying determineNextSkill() returns "aborted".
     */
    it("aborts when reviewFixAttempts reaches maxReviewFixAttempts", () => {
        const maxAttempts = 3;
        // Simulate attempts 0, 1, 2 — all should route to build
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const result = determineNextSkill(makeInput({
                currentPhase: "review",
                reviewResult: "fail",
                reviewFixAttempts: attempt,
                maxReviewFixAttempts: maxAttempts,
            }));
            expect(result.nextPhase).toBe("build");
        }
        // Attempt 3 (== maxAttempts) → should abort
        const abortResult = determineNextSkill(makeInput({
            currentPhase: "review",
            reviewResult: "fail",
            reviewFixAttempts: maxAttempts,
            maxReviewFixAttempts: maxAttempts,
        }));
        expect(abortResult.nextPhase).toBe("aborted");
        expect(abortResult.reason).toContain("exceeded");
    });
    it("aborts even with maxReviewFixAttempts of 1", () => {
        const result = determineNextSkill(makeInput({
            currentPhase: "review",
            reviewResult: "fail",
            reviewFixAttempts: 1,
            maxReviewFixAttempts: 1,
        }));
        expect(result.nextPhase).toBe("aborted");
    });
    it("does not abort when reviewFixAttempts is below max", () => {
        const result = determineNextSkill(makeInput({
            currentPhase: "review",
            reviewResult: "fail",
            reviewFixAttempts: 2,
            maxReviewFixAttempts: 3,
        }));
        expect(result.nextPhase).toBe("build");
    });
});
// ---------------------------------------------------------------------------
// 4. StatusFile round-trip through full sequence
// ---------------------------------------------------------------------------
describe("StatusFile round-trip through full sequence lifecycle", () => {
    /**
     * Validates: Requirements 4.1, 4.2
     *
     * Writes loop fields at start, updates iteration status at each step,
     * clears at end — verifies the full lifecycle.
     */
    it("writes, updates, and clears loop fields across a full sequence", () => {
        const initialContent = '---\ncurrent_task: "Build auth system"\n---\n# Status\n';
        // Step 1: Write initial loop fields at Loop start
        const afterWrite = writeLoopFields(initialContent, {
            mode: "autonomous",
            loopRunId: "run-abc-123",
            loopIteration: 0,
            skillSequence: ["plan", "build", "review", "test", "ship"],
        });
        const fields1 = extractLoopFields(afterWrite);
        expect(fields1.mode).toBe("autonomous");
        expect(fields1.loopRunId).toBe("run-abc-123");
        expect(fields1.loopIteration).toBe(0);
        expect(fields1.skillSequence).toEqual(["plan", "build", "review", "test", "ship"]);
        // Verify existing fields are preserved
        expect(afterWrite).toContain("current_task");
        // Step 2: Update iteration status after router phase
        const afterRouter = updateIterationStatus(afterWrite, "router", 1);
        expect(afterRouter).toContain('phase: "router"');
        expect(afterRouter).toContain("loop_iteration: 1");
        // Existing loop fields should still be present
        expect(extractLoopFields(afterRouter).loopRunId).toBe("run-abc-123");
        // Step 3: Update iteration status after plan phase
        const afterPlan = updateIterationStatus(afterRouter, "plan", 2);
        expect(afterPlan).toContain('phase: "plan"');
        expect(afterPlan).toContain("loop_iteration: 2");
        // Step 4: Update iteration status after build phase
        const afterBuild = updateIterationStatus(afterPlan, "build", 3);
        expect(afterBuild).toContain('phase: "build"');
        expect(afterBuild).toContain("loop_iteration: 3");
        // Step 5: Update iteration status after review phase
        const afterReview = updateIterationStatus(afterBuild, "review", 4);
        expect(afterReview).toContain('phase: "review"');
        expect(afterReview).toContain("loop_iteration: 4");
        // Step 6: Update iteration status after test phase
        const afterTest = updateIterationStatus(afterReview, "test", 5);
        expect(afterTest).toContain('phase: "test"');
        expect(afterTest).toContain("loop_iteration: 5");
        // Step 7: Update iteration status after ship phase
        const afterShip = updateIterationStatus(afterTest, "ship", 6);
        expect(afterShip).toContain('phase: "ship"');
        expect(afterShip).toContain("loop_iteration: 6");
        // Step 8: Clear loop fields at Loop end
        const afterClear = clearLoopFields(afterShip);
        const clearedFields = extractLoopFields(afterClear);
        expect(clearedFields.mode).toBeUndefined();
        expect(clearedFields.loopRunId).toBeUndefined();
        expect(clearedFields.loopIteration).toBeUndefined();
        expect(clearedFields.skillSequence).toBeUndefined();
        // Verify non-loop fields are preserved after clear
        expect(afterClear).toContain("current_task");
        // Phase and loop_iteration set by updateIterationStatus are also loop fields
        // but phase is not in the loop field patterns, so it should remain
        expect(afterClear).toContain("phase");
    });
    it("handles writing loop fields to content without frontmatter", () => {
        const bareContent = "# My Status\nSome notes here.";
        const afterWrite = writeLoopFields(bareContent, {
            mode: "autonomous",
            loopRunId: "run-xyz",
            loopIteration: 1,
        });
        const fields = extractLoopFields(afterWrite);
        expect(fields.mode).toBe("autonomous");
        expect(fields.loopRunId).toBe("run-xyz");
        expect(fields.loopIteration).toBe(1);
        // Original content should still be present
        expect(afterWrite).toContain("# My Status");
    });
});
// ---------------------------------------------------------------------------
// 5. Skill-aware prompt contains correct phase at each step
// ---------------------------------------------------------------------------
describe("Skill-aware prompt contains correct phase at each step", () => {
    /**
     * Validates: Requirements 4.1, 4.2
     *
     * Calls buildSkillAwarePrompt() at each phase and verifies the prompt
     * contains the correct phase, tier, and autonomous mode directive.
     */
    const phases = ["router", "plan", "build", "review", "test", "ship"];
    for (const phase of phases) {
        it(`contains correct context for phase "${phase}"`, () => {
            const prompt = buildSkillAwarePrompt({
                base: { ...basePromptParams, iteration: phases.indexOf(phase) + 1 },
                skill: {
                    phase,
                    tier: "standard",
                },
            });
            // Should contain the phase name
            expect(prompt).toContain(`Current phase: ${phase}`);
            // Should contain the tier
            expect(prompt).toContain("Tier: standard");
            // Should contain the SKILL invocation instruction
            expect(prompt).toContain(`forge-${phase}`);
            // Should always contain autonomous mode directive
            expect(prompt).toContain("mode: autonomous");
            // Should contain the iteration number
            expect(prompt).toContain(`iteration ${phases.indexOf(phase) + 1}`);
            // Should contain the objective
            expect(prompt).toContain("Build a user authentication system");
        });
    }
    it("instructs routing when phase is empty", () => {
        const prompt = buildSkillAwarePrompt({
            base: basePromptParams,
            skill: {
                phase: "",
                tier: "standard",
            },
        });
        expect(prompt).toContain("forge-router");
        expect(prompt).toContain("No phase is set");
        expect(prompt).toContain("Tier: standard");
        expect(prompt).toContain("mode: autonomous");
    });
    it("includes hints when provided", () => {
        const prompt = buildSkillAwarePrompt({
            base: basePromptParams,
            skill: {
                phase: "build",
                tier: "standard",
                hints: [
                    { command: "build", tag: "incremental", description: "Build incrementally" },
                    { command: "test", tag: "unit", description: "Run unit tests after each change" },
                ],
            },
        });
        expect(prompt).toContain("Hints");
        expect(prompt).toContain("Build incrementally");
        expect(prompt).toContain("Run unit tests after each change");
        expect(prompt).toContain("[build] incremental");
        expect(prompt).toContain("[test] unit");
    });
    it("includes fix issues when provided", () => {
        const prompt = buildSkillAwarePrompt({
            base: basePromptParams,
            skill: {
                phase: "build",
                tier: "standard",
                fixIssues: [
                    { severity: "P0", description: "SQL injection vulnerability in login" },
                    { severity: "P1", description: "Missing input validation on email field" },
                ],
            },
        });
        expect(prompt).toContain("Issues to Fix");
        expect(prompt).toContain("P0: SQL injection vulnerability in login");
        expect(prompt).toContain("P1: Missing input validation on email field");
    });
    it("includes taskType and projectPhase when provided", () => {
        const prompt = buildSkillAwarePrompt({
            base: basePromptParams,
            skill: {
                phase: "build",
                tier: "full",
                taskType: "backend",
                projectPhase: "greenfield",
            },
        });
        expect(prompt).toContain("Task type: backend");
        expect(prompt).toContain("Project phase: greenfield");
        expect(prompt).toContain("Tier: full");
    });
});
//# sourceMappingURL=loop-skill-integration.test.js.map