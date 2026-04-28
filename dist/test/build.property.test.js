/**
 * Property tests for the Build engine (Properties 8, 10).
 *
 * Property 8: Build 门禁——Spec 锁定且 Plan 批准
 *   - Build allowed ONLY when spec="locked" AND plan="approved"
 *   - Any other combination → blocked with specific reason
 *   **Validates: Requirements 3.7, 4.8, 5.1, 5.2, 16.1, 16.2**
 *
 * Property 10: 连续失败升级
 *   - 3 consecutive failures → system stops and escalates
 *   - Less than 3 consecutive failures → continues
 *   **Validates: Requirements 5.10, 10.6, 16.8**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { analyzeFixAttempts, checkBuildGate, shouldEscalateToDebug, } from "../src/build.js";
// ---------------------------------------------------------------------------
// Generators — Property 8: Spec status × Plan status combinations
// ---------------------------------------------------------------------------
/** Any valid Spec status. */
const specStatusArb = fc.constantFrom("draft", "locked");
/** Any valid Plan status. */
const planStatusArb = fc.constantFrom("draft", "approved");
/** The one allowed combination: spec="locked" AND plan="approved". */
const allowedCombinationArb = fc.constant({
    spec: "locked",
    plan: "approved",
});
/**
 * Any blocked combination: at least one condition is not met.
 * We generate all combinations and filter out the only allowed one.
 */
const blockedCombinationArb = fc
    .tuple(specStatusArb, planStatusArb)
    .filter(([spec, plan]) => !(spec === "locked" && plan === "approved"))
    .map(([spec, plan]) => ({ spec, plan }));
// ---------------------------------------------------------------------------
// Generators — Property 10: Fix attempt sequences
// ---------------------------------------------------------------------------
/** A single fix attempt result. */
const fixAttemptResultArb = fc.constantFrom("success", "failure");
/** A sequence of fix attempts (arbitrary length). */
const fixAttemptSequenceArb = fc
    .array(fixAttemptResultArb, { minLength: 0, maxLength: 30 })
    .map((attempts) => ({ attempts }));
/**
 * A sequence that contains 3 or more consecutive failures.
 * We build it by placing a block of ≥3 failures somewhere in the sequence.
 */
const sequenceWithEscalationArb = fc
    .tuple(
// Prefix: any attempts that do NOT end with 3+ consecutive failures
fc.array(fixAttemptResultArb, { minLength: 0, maxLength: 10 }), 
// The escalation block: exactly 3 consecutive failures
fc.constant(["failure", "failure", "failure"]), 
// Suffix: anything after (won't matter, escalation already triggered)
fc.array(fixAttemptResultArb, { minLength: 0, maxLength: 10 }))
    .map(([prefix, block, suffix]) => {
    // Ensure the prefix doesn't already contain 3 consecutive failures
    // by inserting a success before the block if prefix ends with failures
    const safePrefix = [...prefix];
    if (safePrefix.length > 0) {
        // Count trailing failures in prefix
        let trailingFailures = 0;
        for (let i = safePrefix.length - 1; i >= 0; i--) {
            if (safePrefix[i] === "failure")
                trailingFailures++;
            else
                break;
        }
        // If trailing failures + block would exceed 3 before the block starts,
        // that's fine — the escalation just happens earlier. But to ensure
        // the block is the trigger, reset with a success if needed.
        if (trailingFailures >= 3) {
            // Prefix already triggers escalation — just use it
            return { attempts: safePrefix };
        }
        // If trailing failures + 3 >= 3, the escalation will trigger during the block
        // which is what we want
    }
    return { attempts: [...safePrefix, ...block, ...suffix] };
})
    .filter((seq) => shouldEscalateToDebug(seq));
/**
 * A sequence that does NOT contain 3 consecutive failures.
 * We ensure no run of 3+ failures exists by inserting successes.
 */
const sequenceWithoutEscalationArb = fc
    .array(fc.tuple(
// 0, 1, or 2 consecutive failures
fc.array(fc.constant("failure"), { minLength: 0, maxLength: 2 }), 
// Followed by a success
fc.constant("success")), { minLength: 0, maxLength: 10 })
    .map((chunks) => {
    const attempts = [];
    for (const [failures, success] of chunks) {
        attempts.push(...failures, success);
    }
    return { attempts };
});
/**
 * A sequence of exactly N consecutive failures (no successes).
 */
const pureFailureSequenceArb = (n) => fc.constant({
    attempts: Array.from({ length: n }, () => "failure"),
});
// ---------------------------------------------------------------------------
// Property 8: Build 门禁——Spec 锁定且 Plan 批准
// ---------------------------------------------------------------------------
describe("Property 8: Build 门禁——Spec 锁定且 Plan 批准", () => {
    it('build allowed when spec="locked" AND plan="approved" (Req 3.7, 4.8, 5.1, 5.2)', () => {
        fc.assert(fc.property(allowedCombinationArb, ({ spec, plan }) => {
            const result = checkBuildGate(spec, plan);
            expect(result.allowed).toBe(true);
            expect(result.reasons).toHaveLength(0);
        }), { numRuns: 200 });
    });
    it("build blocked when any condition is not met (Req 16.1, 16.2)", () => {
        fc.assert(fc.property(blockedCombinationArb, ({ spec, plan }) => {
            const result = checkBuildGate(spec, plan);
            expect(result.allowed).toBe(false);
            expect(result.reasons.length).toBeGreaterThan(0);
        }), { numRuns: 200 });
    });
    it("blocked result includes specific reason for unlocked spec (Req 16.1)", () => {
        fc.assert(fc.property(planStatusArb, (plan) => {
            const result = checkBuildGate("draft", plan);
            expect(result.allowed).toBe(false);
            expect(result.reasons.some((r) => r.includes("Spec 未锁定"))).toBe(true);
        }), { numRuns: 200 });
    });
    it("blocked result includes specific reason for unapproved plan (Req 16.2)", () => {
        fc.assert(fc.property(specStatusArb, (spec) => {
            const result = checkBuildGate(spec, "draft");
            expect(result.allowed).toBe(false);
            expect(result.reasons.some((r) => r.includes("Plan 未批准"))).toBe(true);
        }), { numRuns: 200 });
    });
    it("both conditions failing → two reasons returned", () => {
        fc.assert(fc.property(fc.constant(null), () => {
            const result = checkBuildGate("draft", "draft");
            expect(result.allowed).toBe(false);
            expect(result.reasons).toHaveLength(2);
            expect(result.reasons.some((r) => r.includes("Spec 未锁定"))).toBe(true);
            expect(result.reasons.some((r) => r.includes("Plan 未批准"))).toBe(true);
        }), { numRuns: 200 });
    });
    it("for any spec/plan combination, allowed ↔ (spec=locked ∧ plan=approved)", () => {
        fc.assert(fc.property(specStatusArb, planStatusArb, (spec, plan) => {
            const result = checkBuildGate(spec, plan);
            const expectedAllowed = spec === "locked" && plan === "approved";
            expect(result.allowed).toBe(expectedAllowed);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Property 10: 连续失败升级
// ---------------------------------------------------------------------------
describe("Property 10: 连续失败升级", () => {
    it("3 consecutive failures → escalation triggered (Req 5.10, 16.8)", () => {
        fc.assert(fc.property(sequenceWithEscalationArb, (sequence) => {
            const result = analyzeFixAttempts(sequence);
            expect(result.shouldEscalate).toBe(true);
            expect(result.consecutiveFailures).toBeGreaterThanOrEqual(3);
            expect(result.escalationIndex).toBeGreaterThanOrEqual(2); // At least index 2 (3rd attempt)
        }), { numRuns: 200 });
    });
    it("fewer than 3 consecutive failures → no escalation (Req 5.10)", () => {
        fc.assert(fc.property(sequenceWithoutEscalationArb, (sequence) => {
            const result = analyzeFixAttempts(sequence);
            expect(result.shouldEscalate).toBe(false);
            expect(result.escalationIndex).toBe(-1);
        }), { numRuns: 200 });
    });
    it("success resets the consecutive failure counter (Req 10.6)", () => {
        fc.assert(fc.property(fc.array(fc.tuple(fc.array(fc.constant("failure"), { minLength: 1, maxLength: 2 }), fc.constant("success")), { minLength: 1, maxLength: 10 }), (chunks) => {
            // Build a sequence where failures are always interrupted by success before reaching 3
            const attempts = [];
            for (const [failures, success] of chunks) {
                attempts.push(...failures, success);
            }
            const sequence = { attempts };
            const result = analyzeFixAttempts(sequence);
            expect(result.shouldEscalate).toBe(false);
        }), { numRuns: 200 });
    });
    it("exactly 3 consecutive failures triggers escalation", () => {
        fc.assert(fc.property(pureFailureSequenceArb(3), (sequence) => {
            const result = analyzeFixAttempts(sequence);
            expect(result.shouldEscalate).toBe(true);
            expect(result.consecutiveFailures).toBe(3);
            expect(result.escalationIndex).toBe(2);
        }), { numRuns: 200 });
    });
    it("exactly 2 consecutive failures does NOT trigger escalation", () => {
        fc.assert(fc.property(pureFailureSequenceArb(2), (sequence) => {
            const result = analyzeFixAttempts(sequence);
            expect(result.shouldEscalate).toBe(false);
            expect(result.consecutiveFailures).toBe(2);
        }), { numRuns: 200 });
    });
    it("empty sequence → no escalation", () => {
        const result = analyzeFixAttempts({ attempts: [] });
        expect(result.shouldEscalate).toBe(false);
        expect(result.consecutiveFailures).toBe(0);
        expect(result.escalationIndex).toBe(-1);
    });
    it("all successes → no escalation", () => {
        fc.assert(fc.property(fc.array(fc.constant("success"), { minLength: 1, maxLength: 20 }), (attempts) => {
            const result = analyzeFixAttempts({ attempts });
            expect(result.shouldEscalate).toBe(false);
            expect(result.consecutiveFailures).toBe(0);
        }), { numRuns: 200 });
    });
    it("shouldEscalateToDebug convenience function matches analyzeFixAttempts", () => {
        fc.assert(fc.property(fixAttemptSequenceArb, (sequence) => {
            const detailed = analyzeFixAttempts(sequence);
            const simple = shouldEscalateToDebug(sequence);
            expect(simple).toBe(detailed.shouldEscalate);
        }), { numRuns: 200 });
    });
    it("escalation index points to the 3rd consecutive failure", () => {
        fc.assert(fc.property(sequenceWithEscalationArb, (sequence) => {
            const result = analyzeFixAttempts(sequence);
            if (result.shouldEscalate) {
                const idx = result.escalationIndex;
                // The attempt at escalationIndex must be a failure
                expect(sequence.attempts[idx]).toBe("failure");
                // The two preceding attempts must also be failures
                expect(sequence.attempts[idx - 1]).toBe("failure");
                expect(sequence.attempts[idx - 2]).toBe("failure");
            }
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=build.property.test.js.map