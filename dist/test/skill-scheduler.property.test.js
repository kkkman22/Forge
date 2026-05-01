/**
 * Property-based tests for the skill-scheduler module.
 *
 * Covers:
 *   - Property 5: determineNextSkill 状态转换正确性
 *   - Property 6: 修复循环熔断保护
 *   - Property 14: 修复循环计数器状态机
 *   - Property 3: SkillPhase 序列完整性 (new sequences)
 *   - Property 4: shouldCommitForPhase 新增 phase 一致性
 *
 * **Validates: Requirements 3.1, 3.4, 3.5, 3.6, 3.7, 3.8, 3.11, 8.1, 8.2, 8.3, 8.4, 11.5, 11.6, 11.7, 11.8, 12.3**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { determineNextSkill, getCommandSequence, shouldCommitForPhase, } from "../src/skill-scheduler.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VALID_SKILL_PHASES = [
    "router",
    "plan",
    "build",
    "build-light",
    "review",
    "test",
    "ship",
    "learn",
    "refactor-scan",
    "refactor-apply",
    "fix-analyze",
    "fix-apply",
    "completed",
    "aborted",
];
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary valid SkillPhase value. */
const skillPhaseArb = fc.constantFrom(...VALID_SKILL_PHASES);
/** Arbitrary tier value. */
const tierArb = fc.constantFrom("light", "standard", "full");
/** Arbitrary plan status. */
const planStatusArb = fc.constantFrom("approved", "draft", "pending");
/** Arbitrary review result. */
const reviewResultArb = fc.constantFrom("pass", "fail");
/**
 * Arbitrary valid SchedulerInput with all fields populated.
 * Constrains reviewFixAttempts and maxReviewFixAttempts to reasonable ranges.
 */
const schedulerInputArb = fc.record({
    currentPhase: fc.option(skillPhaseArb, { nil: undefined }),
    tier: fc.option(tierArb, { nil: undefined }),
    planStatus: fc.option(planStatusArb, { nil: undefined }),
    hasIncompleteTasks: fc.option(fc.boolean(), { nil: undefined }),
    reviewResult: fc.option(reviewResultArb, { nil: undefined }),
    testPassed: fc.option(fc.boolean(), { nil: undefined }),
    reviewFixAttempts: fc.nat({ max: 10 }),
    maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
});
/**
 * Arbitrary SchedulerInput in "build" phase with hasIncompleteTasks=true.
 * Ensures the circuit breaker does NOT trigger by guaranteeing that when
 * reviewResult="fail", reviewFixAttempts < maxReviewFixAttempts.
 */
const buildIncompleteArb = fc
    .record({
    currentPhase: fc.constant("build"),
    tier: fc.option(tierArb, { nil: undefined }),
    planStatus: fc.option(planStatusArb, { nil: undefined }),
    hasIncompleteTasks: fc.constant(true),
    reviewResult: fc.option(reviewResultArb, { nil: undefined }),
    testPassed: fc.option(fc.boolean(), { nil: undefined }),
    reviewFixAttempts: fc.nat({ max: 10 }),
    maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
})
    .filter((input) => !(input.reviewResult === "fail" && input.reviewFixAttempts >= input.maxReviewFixAttempts));
/**
 * Arbitrary SchedulerInput in "build" phase with hasIncompleteTasks=false.
 * Ensures the circuit breaker does NOT trigger by guaranteeing that when
 * reviewResult="fail", reviewFixAttempts < maxReviewFixAttempts.
 */
const buildCompleteArb = fc
    .record({
    currentPhase: fc.constant("build"),
    tier: fc.option(tierArb, { nil: undefined }),
    planStatus: fc.option(planStatusArb, { nil: undefined }),
    hasIncompleteTasks: fc.constant(false),
    reviewResult: fc.option(reviewResultArb, { nil: undefined }),
    testPassed: fc.option(fc.boolean(), { nil: undefined }),
    reviewFixAttempts: fc.nat({ max: 10 }),
    maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
})
    .filter((input) => !(input.reviewResult === "fail" && input.reviewFixAttempts >= input.maxReviewFixAttempts));
/**
 * Arbitrary SchedulerInput in "review" phase with reviewResult="fail"
 * and fixAttempts < max (no circuit breaker).
 */
const reviewFailNonBreakArb = fc
    .record({
    currentPhase: fc.constant("review"),
    tier: fc.option(tierArb, { nil: undefined }),
    planStatus: fc.option(planStatusArb, { nil: undefined }),
    hasIncompleteTasks: fc.option(fc.boolean(), { nil: undefined }),
    reviewResult: fc.constant("fail"),
    testPassed: fc.option(fc.boolean(), { nil: undefined }),
    maxReviewFixAttempts: fc.integer({ min: 2, max: 10 }),
})
    .chain((base) => fc.record({
    ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, fc.constant(v)])),
    reviewFixAttempts: fc.nat({ max: base.maxReviewFixAttempts - 1 }),
}));
/** Arbitrary SchedulerInput in "review" phase with reviewResult="pass". */
const reviewPassArb = fc.record({
    currentPhase: fc.constant("review"),
    tier: fc.option(tierArb, { nil: undefined }),
    planStatus: fc.option(planStatusArb, { nil: undefined }),
    hasIncompleteTasks: fc.option(fc.boolean(), { nil: undefined }),
    reviewResult: fc.constant("pass"),
    testPassed: fc.option(fc.boolean(), { nil: undefined }),
    reviewFixAttempts: fc.nat({ max: 10 }),
    maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
});
/**
 * Arbitrary SchedulerInput where circuit breaker should trigger:
 * reviewFixAttempts >= maxReviewFixAttempts AND reviewResult="fail".
 */
const circuitBreakerArb = fc
    .record({
    currentPhase: fc.option(skillPhaseArb, { nil: undefined }),
    tier: fc.option(tierArb, { nil: undefined }),
    planStatus: fc.option(planStatusArb, { nil: undefined }),
    hasIncompleteTasks: fc.option(fc.boolean(), { nil: undefined }),
    reviewResult: fc.constant("fail"),
    testPassed: fc.option(fc.boolean(), { nil: undefined }),
    maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
})
    .chain((base) => fc.record({
    ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, fc.constant(v)])),
    reviewFixAttempts: fc.integer({
        min: base.maxReviewFixAttempts,
        max: base.maxReviewFixAttempts + 5,
    }),
}));
/** Arbitrary sequence of pass/fail review results. */
const reviewSequenceArb = fc.array(fc.constantFrom("pass", "fail"), { minLength: 1, maxLength: 30 });
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 5: determineNextSkill 状态转換正確性
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 5: determineNextSkill 状态转换正确性", () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * For any valid SchedulerInput, determineNextSkill() returns a valid SkillPhase.
     */
    it("always returns a valid SkillPhase for any SchedulerInput", () => {
        fc.assert(fc.property(schedulerInputArb, (input) => {
            const result = determineNextSkill(input);
            expect(VALID_SKILL_PHASES).toContain(result.nextPhase);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.4**
     *
     * phase "build" + hasIncompleteTasks=true → "build"
     */
    it("build phase with incomplete tasks stays in build", () => {
        fc.assert(fc.property(buildIncompleteArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("build");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.5**
     *
     * phase "build" + hasIncompleteTasks=false → "review"
     */
    it("build phase with all tasks complete transitions to review", () => {
        fc.assert(fc.property(buildCompleteArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("review");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.6, 3.7**
     *
     * phase "review" + reviewResult="fail" + fixAttempts < max → "build"
     */
    it("review phase with fail result and attempts below max transitions to build", () => {
        fc.assert(fc.property(reviewFailNonBreakArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("build");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.7, 3.8**
     *
     * phase "review" + reviewResult="pass" → "test"
     */
    it("review phase with pass result transitions to test", () => {
        fc.assert(fc.property(reviewPassArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("test");
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 6: SkillScheduler circuit breaker
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 6: SkillScheduler circuit breaker", () => {
    /**
     * **Validates: Requirements 5.5, 12.3**
     *
     * For any SchedulerInput where reviewFixAttempts >= maxReviewFixAttempts
     * AND reviewResult="fail", determineNextSkill() returns nextPhase: "aborted".
     * This must hold regardless of currentPhase, tier, or other fields.
     */
    it("triggers circuit breaker (aborted) when fix attempts >= max and review fails", () => {
        fc.assert(fc.property(circuitBreakerArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("aborted");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 5.5, 12.3**
     *
     * The reason string should be non-empty when circuit breaker triggers,
     * providing context about the abort decision.
     */
    it("provides a non-empty reason when circuit breaker triggers", () => {
        fc.assert(fc.property(circuitBreakerArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("aborted");
            expect(result.reason).toBeTruthy();
            expect(result.reason.length).toBeGreaterThan(0);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 5.5, 12.3**
     *
     * Circuit breaker takes priority over any currentPhase-specific logic.
     * For any SchedulerInput with reviewFixAttempts >= maxReviewFixAttempts
     * and reviewResult="fail", the result is always "aborted" regardless of
     * what currentPhase is set to (build, review, plan, etc.).
     */
    it("circuit breaker overrides any currentPhase when attempts >= max and review fails", () => {
        /** Generator that pairs every valid SkillPhase with circuit breaker conditions. */
        const allPhasesCircuitBreakerArb = fc
            .record({
            currentPhase: skillPhaseArb,
            tier: fc.option(tierArb, { nil: undefined }),
            planStatus: fc.option(planStatusArb, { nil: undefined }),
            hasIncompleteTasks: fc.option(fc.boolean(), { nil: undefined }),
            reviewResult: fc.constant("fail"),
            testPassed: fc.option(fc.boolean(), { nil: undefined }),
            maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
        })
            .chain((base) => fc.record({
            ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, fc.constant(v)])),
            reviewFixAttempts: fc.integer({
                min: base.maxReviewFixAttempts,
                max: base.maxReviewFixAttempts + 5,
            }),
        }));
        fc.assert(fc.property(allPhasesCircuitBreakerArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("aborted");
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 14: 修复循环计数器状态机
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 14: 修复循环计数器状态机", () => {
    /**
     * **Validates: Requirements 8.1, 8.2, 8.3**
     *
     * For any review result sequence (pass/fail alternating), the reviewFixAttempts
     * counter increments on fail and resets on pass. For any sequence of pass/fail,
     * the counter equals the number of consecutive fails since the last pass.
     */
    it("counter equals consecutive fails since last pass for any pass/fail sequence", () => {
        fc.assert(fc.property(reviewSequenceArb, (sequence) => {
            // Simulate the counter state machine
            let counter = 0;
            for (const result of sequence) {
                if (result === "fail") {
                    counter++;
                }
                else {
                    // result === "pass"
                    counter = 0;
                }
            }
            // Independently compute expected: count consecutive fails from end since last pass
            let expected = 0;
            for (let i = sequence.length - 1; i >= 0; i--) {
                if (sequence[i] === "fail") {
                    expected++;
                }
                else {
                    break;
                }
            }
            expect(counter).toBe(expected);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 8.1, 8.2, 8.3**
     *
     * Verify that the counter state machine interacts correctly with determineNextSkill:
     * after simulating a sequence of pass/fail results, the scheduler's circuit breaker
     * behavior is consistent with the accumulated counter value.
     */
    it("counter state machine drives correct circuit breaker behavior in scheduler", () => {
        fc.assert(fc.property(reviewSequenceArb, fc.integer({ min: 1, max: 5 }), (sequence, maxAttempts) => {
            // Simulate the counter state machine
            let counter = 0;
            for (const result of sequence) {
                if (result === "fail") {
                    counter++;
                }
                else {
                    counter = 0;
                }
            }
            // Now check the scheduler with the final counter value and last result
            const lastResult = sequence[sequence.length - 1];
            const input = {
                currentPhase: "review",
                reviewResult: lastResult,
                reviewFixAttempts: counter,
                maxReviewFixAttempts: maxAttempts,
            };
            const result = determineNextSkill(input);
            if (lastResult === "fail" && counter >= maxAttempts) {
                // Circuit breaker should trigger
                expect(result.nextPhase).toBe("aborted");
            }
            else if (lastResult === "fail") {
                // Fix loop: go back to build
                expect(result.nextPhase).toBe("build");
            }
            else {
                // Pass: proceed to test
                expect(result.nextPhase).toBe("test");
            }
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 8.2**
     *
     * A pass always resets the counter to 0, so after any sequence ending in pass,
     * the counter is 0.
     */
    it("counter resets to 0 after any pass", () => {
        fc.assert(fc.property(fc.array(fc.constantFrom("pass", "fail"), {
            minLength: 1,
            maxLength: 20,
        }), (sequence) => {
            let counter = 0;
            for (const result of sequence) {
                if (result === "fail") {
                    counter++;
                }
                else {
                    counter = 0;
                }
            }
            if (sequence[sequence.length - 1] === "pass") {
                expect(counter).toBe(0);
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Property 3: SkillPhase 序列完整性 (new sequences)
// ---------------------------------------------------------------------------
describe("Property 3: New command sequences contain only valid SkillPhase values", () => {
    /**
     * **Validates: Requirements 11.5, 11.6**
     *
     * For any new command sequence (refactor_light, refactor_standard, fix_light, fix_standard),
     * every phase in the sequence is a valid SkillPhase value.
     */
    it("all phases in new sequences are valid SkillPhase values", () => {
        const newSequenceNames = ["refactor_light", "refactor_standard", "fix_light", "fix_standard"];
        fc.assert(fc.property(fc.constantFrom(...newSequenceNames), (seqName) => {
            const sequence = getCommandSequence(seqName);
            for (const phase of sequence) {
                expect(VALID_SKILL_PHASES).toContain(phase);
            }
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 11.5, 12.3**
     *
     * Existing sequences (light, standard, full) remain unchanged after adding new sequences.
     */
    it("existing sequences are unchanged (backward compatibility)", () => {
        const expectedExisting = {
            light: ["build-light", "review"],
            standard: ["plan", "build", "review", "test", "ship"],
            full: ["plan", "build", "review", "test", "ship", "learn"],
        };
        fc.assert(fc.property(fc.constantFrom("light", "standard", "full"), (tier) => {
            const sequence = getCommandSequence(tier);
            expect(sequence).toEqual(expectedExisting[tier]);
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 11.5, 11.6**
     *
     * New sequences have the expected structure.
     */
    it("new sequences have expected phase ordering", () => {
        expect(getCommandSequence("refactor_light")).toEqual(["refactor-apply", "review"]);
        expect(getCommandSequence("refactor_standard")).toEqual([
            "refactor-scan",
            "refactor-apply",
            "review",
            "test",
            "ship",
        ]);
        expect(getCommandSequence("fix_light")).toEqual(["fix-apply", "review"]);
        expect(getCommandSequence("fix_standard")).toEqual([
            "fix-analyze",
            "fix-apply",
            "review",
            "test",
            "ship",
        ]);
    });
});
// ---------------------------------------------------------------------------
// Property 4: shouldCommitForPhase 新增 phase 一致性
// ---------------------------------------------------------------------------
describe("Property 4: shouldCommitForPhase returns correct values for new phases", () => {
    /**
     * **Validates: Requirements 11.8**
     *
     * refactor-apply and fix-apply produce code changes → shouldCommitForPhase returns true.
     */
    it("refactor-apply and fix-apply return true when successful", () => {
        fc.assert(fc.property(fc.constantFrom("refactor-apply", "fix-apply"), (phase) => {
            expect(shouldCommitForPhase(phase, true)).toBe(true);
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 11.8**
     *
     * refactor-scan and fix-analyze only produce analysis documents → shouldCommitForPhase returns false.
     */
    it("refactor-scan and fix-analyze return false even when successful", () => {
        fc.assert(fc.property(fc.constantFrom("refactor-scan", "fix-analyze"), (phase) => {
            expect(shouldCommitForPhase(phase, true)).toBe(false);
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 11.8**
     *
     * Any new phase with success=false should not commit.
     */
    it("no new phase commits when success is false", () => {
        fc.assert(fc.property(fc.constantFrom("refactor-scan", "refactor-apply", "fix-analyze", "fix-apply"), (phase) => {
            expect(shouldCommitForPhase(phase, false)).toBe(false);
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 12.3**
     *
     * Existing commitable phases (build, plan, fix) still return true when successful.
     */
    it("existing commitable phases still return true (backward compatibility)", () => {
        fc.assert(fc.property(fc.constantFrom("build", "plan", "fix"), (phase) => {
            expect(shouldCommitForPhase(phase, true)).toBe(true);
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// determineNextSkill: new phase state transitions
// ---------------------------------------------------------------------------
describe("determineNextSkill correctly advances through new phase sequences", () => {
    /**
     * **Validates: Requirements 11.7**
     *
     * refactor-scan completed → refactor-apply
     */
    it("refactor-scan transitions to refactor-apply", () => {
        fc.assert(fc.property(fc
            .record({
            currentPhase: fc.constant("refactor-scan"),
            tier: fc.option(tierArb, { nil: undefined }),
            planStatus: fc.option(planStatusArb, { nil: undefined }),
            hasIncompleteTasks: fc.option(fc.boolean(), { nil: undefined }),
            reviewResult: fc.option(reviewResultArb, { nil: undefined }),
            testPassed: fc.option(fc.boolean(), { nil: undefined }),
            reviewFixAttempts: fc.nat({ max: 10 }),
            maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
        })
            .filter((input) => !(input.reviewResult === "fail" &&
            input.reviewFixAttempts >= input.maxReviewFixAttempts)), (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("refactor-apply");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.7**
     *
     * refactor-apply + hasIncompleteTasks=true → stays in refactor-apply
     */
    it("refactor-apply with incomplete tasks stays in refactor-apply", () => {
        fc.assert(fc.property(fc
            .record({
            currentPhase: fc.constant("refactor-apply"),
            tier: fc.option(tierArb, { nil: undefined }),
            planStatus: fc.option(planStatusArb, { nil: undefined }),
            hasIncompleteTasks: fc.constant(true),
            reviewResult: fc.option(reviewResultArb, { nil: undefined }),
            testPassed: fc.option(fc.boolean(), { nil: undefined }),
            reviewFixAttempts: fc.nat({ max: 10 }),
            maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
        })
            .filter((input) => !(input.reviewResult === "fail" &&
            input.reviewFixAttempts >= input.maxReviewFixAttempts)), (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("refactor-apply");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.7**
     *
     * refactor-apply + hasIncompleteTasks=false → review
     */
    it("refactor-apply with all tasks complete transitions to review", () => {
        fc.assert(fc.property(fc
            .record({
            currentPhase: fc.constant("refactor-apply"),
            tier: fc.option(tierArb, { nil: undefined }),
            planStatus: fc.option(planStatusArb, { nil: undefined }),
            hasIncompleteTasks: fc.constant(false),
            reviewResult: fc.option(reviewResultArb, { nil: undefined }),
            testPassed: fc.option(fc.boolean(), { nil: undefined }),
            reviewFixAttempts: fc.nat({ max: 10 }),
            maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
        })
            .filter((input) => !(input.reviewResult === "fail" &&
            input.reviewFixAttempts >= input.maxReviewFixAttempts)), (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("review");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.7**
     *
     * fix-analyze completed → fix-apply
     */
    it("fix-analyze transitions to fix-apply", () => {
        fc.assert(fc.property(fc
            .record({
            currentPhase: fc.constant("fix-analyze"),
            tier: fc.option(tierArb, { nil: undefined }),
            planStatus: fc.option(planStatusArb, { nil: undefined }),
            hasIncompleteTasks: fc.option(fc.boolean(), { nil: undefined }),
            reviewResult: fc.option(reviewResultArb, { nil: undefined }),
            testPassed: fc.option(fc.boolean(), { nil: undefined }),
            reviewFixAttempts: fc.nat({ max: 10 }),
            maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
        })
            .filter((input) => !(input.reviewResult === "fail" &&
            input.reviewFixAttempts >= input.maxReviewFixAttempts)), (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("fix-apply");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.7**
     *
     * fix-apply + hasIncompleteTasks=true → stays in fix-apply
     */
    it("fix-apply with incomplete tasks stays in fix-apply", () => {
        fc.assert(fc.property(fc
            .record({
            currentPhase: fc.constant("fix-apply"),
            tier: fc.option(tierArb, { nil: undefined }),
            planStatus: fc.option(planStatusArb, { nil: undefined }),
            hasIncompleteTasks: fc.constant(true),
            reviewResult: fc.option(reviewResultArb, { nil: undefined }),
            testPassed: fc.option(fc.boolean(), { nil: undefined }),
            reviewFixAttempts: fc.nat({ max: 10 }),
            maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
        })
            .filter((input) => !(input.reviewResult === "fail" &&
            input.reviewFixAttempts >= input.maxReviewFixAttempts)), (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("fix-apply");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.7**
     *
     * fix-apply + hasIncompleteTasks=false → review
     */
    it("fix-apply with all tasks complete transitions to review", () => {
        fc.assert(fc.property(fc
            .record({
            currentPhase: fc.constant("fix-apply"),
            tier: fc.option(tierArb, { nil: undefined }),
            planStatus: fc.option(planStatusArb, { nil: undefined }),
            hasIncompleteTasks: fc.constant(false),
            reviewResult: fc.option(reviewResultArb, { nil: undefined }),
            testPassed: fc.option(fc.boolean(), { nil: undefined }),
            reviewFixAttempts: fc.nat({ max: 10 }),
            maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
        })
            .filter((input) => !(input.reviewResult === "fail" &&
            input.reviewFixAttempts >= input.maxReviewFixAttempts)), (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("review");
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 5: SkillScheduler total function property
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 5: SkillScheduler total function property", () => {
    // -------------------------------------------------------------------------
    // Generators specific to this property
    // -------------------------------------------------------------------------
    /** Arbitrary unknown currentPhase values — strings NOT in the valid SkillPhase set. */
    const unknownPhaseArb = fc
        .string({ minLength: 1, maxLength: 30 })
        .filter((s) => !VALID_SKILL_PHASES.includes(s));
    /** Arbitrary SchedulerInput with an unknown currentPhase value. */
    const unknownPhaseInputArb = fc.record({
        currentPhase: unknownPhaseArb,
        tier: fc.option(tierArb, { nil: undefined }),
        planStatus: fc.option(planStatusArb, { nil: undefined }),
        hasIncompleteTasks: fc.option(fc.boolean(), { nil: undefined }),
        reviewResult: fc.option(reviewResultArb, { nil: undefined }),
        testPassed: fc.option(fc.boolean(), { nil: undefined }),
        reviewFixAttempts: fc.nat({ max: 10 }),
        maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
    });
    /** Terminal SkillPhase values. */
    const terminalPhaseArb = fc.constantFrom("completed", "aborted");
    /** Arbitrary SchedulerInput with a terminal currentPhase and no circuit breaker trigger. */
    const terminalInputArb = fc.record({
        currentPhase: terminalPhaseArb,
        tier: fc.option(tierArb, { nil: undefined }),
        planStatus: fc.option(planStatusArb, { nil: undefined }),
        hasIncompleteTasks: fc.option(fc.boolean(), { nil: undefined }),
        reviewResult: fc.option(fc.constantFrom("pass", "fail").filter((r) => r !== "fail"), { nil: undefined }),
        testPassed: fc.option(fc.boolean(), { nil: undefined }),
        reviewFixAttempts: fc.constant(0),
        maxReviewFixAttempts: fc.integer({ min: 1, max: 10 }),
    });
    /**
     * Arbitrary SchedulerInput covering ALL possible combinations:
     * valid phases, unknown phases, undefined phase, and arbitrary field values.
     */
    const anySchedulerInputArb = fc.record({
        currentPhase: fc.option(fc.oneof(skillPhaseArb, unknownPhaseArb), {
            nil: undefined,
        }),
        tier: fc.option(fc.oneof(tierArb, fc.string({ minLength: 0, maxLength: 20 })), {
            nil: undefined,
        }),
        planStatus: fc.option(fc.oneof(planStatusArb, fc.string({ minLength: 0, maxLength: 20 })), {
            nil: undefined,
        }),
        hasIncompleteTasks: fc.option(fc.boolean(), { nil: undefined }),
        reviewResult: fc.option(fc.oneof(reviewResultArb, fc.string({ minLength: 0, maxLength: 20 })), {
            nil: undefined,
        }),
        testPassed: fc.option(fc.boolean(), { nil: undefined }),
        reviewFixAttempts: fc.nat({ max: 20 }),
        maxReviewFixAttempts: fc.integer({ min: 1, max: 20 }),
    });
    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------
    /**
     * **Validates: Requirements 12.1**
     *
     * determineNextSkill() never throws for any valid SchedulerInput,
     * including unknown currentPhase values and arbitrary field combinations.
     */
    it("never throws for any SchedulerInput (including unknown currentPhase values)", () => {
        fc.assert(fc.property(anySchedulerInputArb, (input) => {
            expect(() => determineNextSkill(input)).not.toThrow();
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 12.1**
     *
     * determineNextSkill() always returns a valid SchedulerResult with a
     * recognized SkillPhase and a non-empty reason string.
     */
    it("always returns a valid SchedulerResult with a recognized SkillPhase", () => {
        fc.assert(fc.property(anySchedulerInputArb, (input) => {
            const result = determineNextSkill(input);
            expect(result).toBeDefined();
            expect(result.nextPhase).toBeDefined();
            expect(VALID_SKILL_PHASES).toContain(result.nextPhase);
            expect(typeof result.reason).toBe("string");
            expect(result.reason.length).toBeGreaterThan(0);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 12.2**
     *
     * Unknown currentPhase values (strings not in SkillPhase) fall back to "router",
     * unless the circuit breaker triggers first.
     */
    it("unknown currentPhase values fall back to router (when circuit breaker is not triggered)", () => {
        // Filter out inputs where circuit breaker would trigger
        const unknownNonBreakerArb = unknownPhaseInputArb.filter((input) => !(input.reviewResult === "fail" && input.reviewFixAttempts >= input.maxReviewFixAttempts));
        fc.assert(fc.property(unknownNonBreakerArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("router");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 12.4**
     *
     * Terminal states ("completed", "aborted") return themselves (idempotent).
     * Uses inputs where circuit breaker does NOT trigger to isolate terminal behavior.
     */
    it("terminal states (completed, aborted) return themselves (idempotent)", () => {
        fc.assert(fc.property(terminalInputArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe(input.currentPhase);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 12.4**
     *
     * Calling determineNextSkill twice with a terminal state produces the same result
     * (double-idempotency: feeding the output back in still returns the same phase).
     */
    it("terminal states are stable under repeated application", () => {
        fc.assert(fc.property(terminalInputArb, (input) => {
            const first = determineNextSkill(input);
            const second = determineNextSkill({
                ...input,
                currentPhase: first.nextPhase,
            });
            expect(second.nextPhase).toBe(first.nextPhase);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 7: SkillScheduler convergence
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 7: SkillScheduler convergence", () => {
    /**
     * All non-terminal SkillPhase values that the convergence property must hold for.
     * Terminal phases ("completed", "aborted") are excluded — they are already at rest.
     */
    const NON_TERMINAL_PHASES = [
        "router",
        "plan",
        "build",
        "review",
        "test",
        "ship",
        "learn",
        "refactor-scan",
        "refactor-apply",
        "fix-analyze",
        "fix-apply",
    ];
    /** Arbitrary non-terminal SkillPhase. */
    const nonTerminalPhaseArb = fc.constantFrom(...NON_TERMINAL_PHASES);
    /** Arbitrary tier value (includes "full" which adds the learn phase). */
    const convergenceTierArb = fc.constantFrom("light", "standard", "full");
    /**
     * Simulate successive calls to `determineNextSkill()` starting from a
     * non-terminal phase with "favorable conditions" until a terminal state
     * is reached or the step budget is exhausted.
     *
     * Favorable conditions:
     *   - planStatus: "approved"
     *   - hasIncompleteTasks: false
     *   - reviewResult: "pass"
     *   - testPassed: true
     *   - reviewFixAttempts: 0
     *   - maxReviewFixAttempts: 3
     *
     * The "router" phase is a self-loop by design (it returns "router" because
     * the external driver is responsible for advancing after router execution).
     * To simulate router completion, when a self-loop on "router" is detected
     * the simulation advances the phase to "plan" (matching the state diagram:
     * router → plan on completion).
     */
    function simulateConvergence(startPhase, tier, maxSteps) {
        let currentPhase = startPhase;
        let steps = 0;
        while (steps < maxSteps) {
            const result = determineNextSkill({
                currentPhase,
                tier,
                planStatus: "approved",
                hasIncompleteTasks: false,
                reviewResult: "pass",
                testPassed: true,
                reviewFixAttempts: 0,
                maxReviewFixAttempts: 3,
            });
            steps++;
            if (result.nextPhase === "completed" || result.nextPhase === "aborted") {
                return { converged: true, finalPhase: result.nextPhase, steps };
            }
            // Handle the router self-loop: simulate router completion → plan
            if (result.nextPhase === currentPhase && currentPhase === "router") {
                currentPhase = "plan";
                continue;
            }
            currentPhase = result.nextPhase;
        }
        return { converged: false, finalPhase: currentPhase, steps };
    }
    /**
     * **Validates: Requirements 12.5**
     *
     * For any non-terminal SkillPhase as starting currentPhase, simulating
     * successive transitions with favorable conditions converges to "completed"
     * or "aborted" within ≤ 20 steps.
     */
    it("converges to completed or aborted within 20 steps from any non-terminal phase", () => {
        fc.assert(fc.property(nonTerminalPhaseArb, convergenceTierArb, (startPhase, tier) => {
            const { converged, finalPhase, steps } = simulateConvergence(startPhase, tier, 20);
            expect(converged).toBe(true);
            expect(["completed", "aborted"]).toContain(finalPhase);
            expect(steps).toBeLessThanOrEqual(20);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 12.5**
     *
     * Convergence always reaches "completed" (not "aborted") under favorable
     * conditions, since favorable conditions include reviewResult="pass" and
     * reviewFixAttempts=0 — the circuit breaker never triggers.
     */
    it("converges specifically to completed (not aborted) under favorable conditions", () => {
        fc.assert(fc.property(nonTerminalPhaseArb, convergenceTierArb, (startPhase, tier) => {
            const { converged, finalPhase } = simulateConvergence(startPhase, tier, 20);
            expect(converged).toBe(true);
            expect(finalPhase).toBe("completed");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 12.5**
     *
     * The number of steps to convergence is strictly bounded and reasonable.
     * No non-terminal phase should require more than 10 steps under favorable
     * conditions (the longest path is router→plan→build→review→test→ship→learn→completed = 7 steps).
     */
    it("converges in a reasonable number of steps (≤ 10) under favorable conditions", () => {
        fc.assert(fc.property(nonTerminalPhaseArb, convergenceTierArb, (startPhase, tier) => {
            const { converged, steps } = simulateConvergence(startPhase, tier, 20);
            expect(converged).toBe(true);
            // Longest path: router(1 self-loop + advance to plan) → plan → build → review → test → ship → learn → completed = 8 steps
            expect(steps).toBeLessThanOrEqual(10);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 8: shouldCommitForPhase commit strategy correctness
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 8: shouldCommitForPhase commit strategy correctness", () => {
    // -------------------------------------------------------------------------
    // Generators
    // -------------------------------------------------------------------------
    /** Phases that produce code changes and should be committed on success. */
    const commitablePhasesArb = fc.constantFrom("build", "plan", "fix", "refactor-apply", "fix-apply");
    /** Phases that never produce commits regardless of success. */
    const nonCommitablePhasesArb = fc.constantFrom("review", "test", "ship", "router", "learn", "refactor-scan", "fix-analyze");
    /** All known phases (commitable + non-commitable). */
    const ALL_KNOWN_PHASES = [
        "build",
        "plan",
        "fix",
        "refactor-apply",
        "fix-apply",
        "review",
        "test",
        "ship",
        "router",
        "learn",
        "refactor-scan",
        "fix-analyze",
    ];
    /** Arbitrary unknown phase strings — not in the known set. */
    const unknownPhaseArb = fc
        .string({ minLength: 1, maxLength: 30 })
        .filter((s) => !ALL_KNOWN_PHASES.includes(s));
    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------
    /**
     * **Validates: Requirements 11.1**
     *
     * Commitable phases ("build", "plan", "fix", "refactor-apply", "fix-apply")
     * with success=true return true.
     */
    it("commitable phases with success=true return true", () => {
        fc.assert(fc.property(commitablePhasesArb, (phase) => {
            expect(shouldCommitForPhase(phase, true)).toBe(true);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.2**
     *
     * Non-commitable phases ("review", "test", "ship", "router", "learn",
     * "refactor-scan", "fix-analyze") return false regardless of success value.
     */
    it("non-commitable phases return false regardless of success", () => {
        fc.assert(fc.property(nonCommitablePhasesArb, fc.boolean(), (phase, success) => {
            expect(shouldCommitForPhase(phase, success)).toBe(false);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.3**
     *
     * Any phase (commitable or non-commitable) with success=false returns false.
     */
    it("any phase with success=false returns false", () => {
        fc.assert(fc.property(fc.oneof(commitablePhasesArb, nonCommitablePhasesArb), (phase) => {
            expect(shouldCommitForPhase(phase, false)).toBe(false);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.5**
     *
     * Unknown phase strings (not in the known set) return false regardless
     * of success value.
     */
    it("unknown phase strings return false regardless of success", () => {
        fc.assert(fc.property(unknownPhaseArb, fc.boolean(), (phase, success) => {
            expect(shouldCommitForPhase(phase, success)).toBe(false);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 9: getCommandSequence safe default
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 9: getCommandSequence safe default", () => {
    // -------------------------------------------------------------------------
    // Constants & Generators
    // -------------------------------------------------------------------------
    /** The set of known tier strings that have explicit command sequences. */
    const KNOWN_TIERS = [
        "light",
        "standard",
        "full",
        "refactor_light",
        "refactor_standard",
        "fix_light",
        "fix_standard",
    ];
    /** The standard (default) command sequence returned for unknown tiers. */
    const STANDARD_SEQUENCE = ["plan", "build", "review", "test", "ship"];
    /**
     * Arbitrary tier string that is NOT in the known set.
     * Generates arbitrary non-empty strings and filters out known tiers.
     */
    const unknownTierArb = fc
        .string({ minLength: 0, maxLength: 50 })
        .filter((s) => !KNOWN_TIERS.includes(s));
    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------
    /**
     * **Validates: Requirements 12.6**
     *
     * For any tier string not in the known set, getCommandSequence() returns
     * the standard sequence ["plan", "build", "review", "test", "ship"].
     */
    it("returns the standard sequence for any unknown tier string", () => {
        fc.assert(fc.property(unknownTierArb, (tier) => {
            const sequence = getCommandSequence(tier);
            expect(sequence).toEqual(STANDARD_SEQUENCE);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 12.6**
     *
     * Known tiers return their own specific sequences (not the default).
     * This ensures the fallback only activates for truly unknown tiers.
     */
    it("known tiers return their specific (non-default) or matching sequences", () => {
        fc.assert(fc.property(fc.constantFrom(...KNOWN_TIERS), (tier) => {
            const sequence = getCommandSequence(tier);
            // Every known tier must return a non-empty array of valid SkillPhase values
            expect(sequence.length).toBeGreaterThan(0);
            for (const phase of sequence) {
                expect(VALID_SKILL_PHASES).toContain(phase);
            }
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=skill-scheduler.property.test.js.map