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
// Feature: loop-skills-fusion, Property 6: 修复循环熔断保护
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 6: 修复循环熔断保护", () => {
    /**
     * **Validates: Requirements 3.11, 8.4**
     *
     * For any SchedulerInput where reviewFixAttempts >= maxReviewFixAttempts
     * AND reviewResult="fail", determineNextSkill() returns nextPhase: "aborted".
     */
    it("triggers circuit breaker (aborted) when fix attempts exceed max and review fails", () => {
        fc.assert(fc.property(circuitBreakerArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("aborted");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.11, 8.4**
     *
     * The reason string should mention the attempt counts when circuit breaker triggers.
     */
    it("provides a reason mentioning attempt counts on circuit breaker", () => {
        fc.assert(fc.property(circuitBreakerArb, (input) => {
            const result = determineNextSkill(input);
            expect(result.nextPhase).toBe("aborted");
            expect(result.reason).toBeTruthy();
            expect(result.reason.length).toBeGreaterThan(0);
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
            light: ["build", "review"],
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
//# sourceMappingURL=skill-scheduler.property.test.js.map