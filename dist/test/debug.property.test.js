/**
 * Property tests for the Debug engine (Properties 21, 22).
 *
 * Property 21: Debug 假设验证升级
 *   - 3 consecutive hypothesis rejections → escalate to architecture review
 *   - Confirmed hypothesis resets the counter
 *   **Validates: CLAUDE.md §2.4 second-level three-strikes**
 *
 * Property 22: Debug 假设完整性
 *   - Every hypothesis must have: description, verifyCommand, expectedOutcome
 *   - Incomplete hypotheses are rejected
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { analyzeHypothesisResults, DEBUG_PHASES, getNextPhase, HYPOTHESIS_ESCALATION_THRESHOLD, isValidPhaseTransition, shouldQuestionArchitecture, validateHypothesis, } from "../src/debug.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const hypothesisResultArb = fc.constantFrom("confirmed", "rejected");
const hypothesisSequenceArb = fc
    .array(hypothesisResultArb, { minLength: 0, maxLength: 30 })
    .map((results) => ({ results }));
/** Sequence guaranteed to have 3+ consecutive rejections. */
const sequenceWithEscalationArb = fc
    .tuple(fc.array(hypothesisResultArb, { minLength: 0, maxLength: 10 }), fc.constant(["rejected", "rejected", "rejected"]), fc.array(hypothesisResultArb, { minLength: 0, maxLength: 10 }))
    .map(([prefix, block, suffix]) => {
    const safePrefix = [...prefix];
    // Ensure prefix doesn't already trigger escalation
    let consecutive = 0;
    for (const r of safePrefix) {
        if (r === "rejected")
            consecutive++;
        else
            consecutive = 0;
        if (consecutive >= 3)
            return { results: safePrefix };
    }
    return { results: [...safePrefix, ...block, ...suffix] };
})
    .filter((seq) => shouldQuestionArchitecture(seq));
/** Sequence guaranteed to NOT have 3 consecutive rejections. */
const sequenceWithoutEscalationArb = fc
    .array(fc.tuple(fc.array(fc.constant("rejected"), { minLength: 0, maxLength: 2 }), fc.constant("confirmed")), { minLength: 0, maxLength: 10 })
    .map((chunks) => {
    const results = [];
    for (const [rejections, confirmed] of chunks) {
        results.push(...rejections, confirmed);
    }
    return { results };
});
const nonEmptyStringArb = fc
    .stringMatching(/^[a-z ]{3,20}$/)
    .filter((s) => s.trim().length > 0);
const validHypothesisArb = fc.record({
    description: nonEmptyStringArb,
    verifyCommand: nonEmptyStringArb,
    expectedOutcome: nonEmptyStringArb,
});
const debugPhaseArb = fc.constantFrom("collect", "pattern", "hypothesize", "fix");
// ---------------------------------------------------------------------------
// Property 21: Debug 假设验证升级
// ---------------------------------------------------------------------------
describe("Property 21: Debug 假设验证升级", () => {
    it("3 consecutive rejections → escalation triggered", () => {
        fc.assert(fc.property(sequenceWithEscalationArb, (sequence) => {
            const result = analyzeHypothesisResults(sequence);
            expect(result.shouldEscalate).toBe(true);
            expect(result.consecutiveRejections).toBeGreaterThanOrEqual(HYPOTHESIS_ESCALATION_THRESHOLD);
            expect(result.escalationIndex).toBeGreaterThanOrEqual(2);
        }), { numRuns: 50 });
    });
    it("fewer than 3 consecutive rejections → no escalation", () => {
        fc.assert(fc.property(sequenceWithoutEscalationArb, (sequence) => {
            const result = analyzeHypothesisResults(sequence);
            expect(result.shouldEscalate).toBe(false);
            expect(result.escalationIndex).toBe(-1);
        }), { numRuns: 50 });
    });
    it("confirmed hypothesis resets the counter", () => {
        fc.assert(fc.property(fc.array(fc.tuple(fc.array(fc.constant("rejected"), { minLength: 1, maxLength: 2 }), fc.constant("confirmed")), { minLength: 1, maxLength: 10 }), (chunks) => {
            const results = [];
            for (const [rejections, confirmed] of chunks) {
                results.push(...rejections, confirmed);
            }
            const result = analyzeHypothesisResults({ results });
            expect(result.shouldEscalate).toBe(false);
        }), { numRuns: 50 });
    });
    it("exactly 3 consecutive rejections triggers escalation", () => {
        const result = analyzeHypothesisResults({
            results: ["rejected", "rejected", "rejected"],
        });
        expect(result.shouldEscalate).toBe(true);
        expect(result.consecutiveRejections).toBe(3);
        expect(result.escalationIndex).toBe(2);
    });
    it("exactly 2 consecutive rejections does NOT trigger escalation", () => {
        const result = analyzeHypothesisResults({
            results: ["rejected", "rejected"],
        });
        expect(result.shouldEscalate).toBe(false);
        expect(result.consecutiveRejections).toBe(2);
    });
    it("empty sequence → no escalation", () => {
        const result = analyzeHypothesisResults({ results: [] });
        expect(result.shouldEscalate).toBe(false);
        expect(result.consecutiveRejections).toBe(0);
        expect(result.escalationIndex).toBe(-1);
    });
    it("shouldQuestionArchitecture matches analyzeHypothesisResults", () => {
        fc.assert(fc.property(hypothesisSequenceArb, (sequence) => {
            const detailed = analyzeHypothesisResults(sequence);
            const simple = shouldQuestionArchitecture(sequence);
            expect(simple).toBe(detailed.shouldEscalate);
        }), { numRuns: 50 });
    });
    it("escalation index points to the 3rd consecutive rejection", () => {
        fc.assert(fc.property(sequenceWithEscalationArb, (sequence) => {
            const result = analyzeHypothesisResults(sequence);
            if (result.shouldEscalate) {
                const idx = result.escalationIndex;
                expect(sequence.results[idx]).toBe("rejected");
                expect(sequence.results[idx - 1]).toBe("rejected");
                expect(sequence.results[idx - 2]).toBe("rejected");
            }
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property 22: Debug 假设完整性
// ---------------------------------------------------------------------------
describe("Property 22: Debug 假设完整性", () => {
    it("valid hypothesis passes validation", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const result = validateHypothesis(hypothesis);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        }), { numRuns: 50 });
    });
    it("empty description fails validation", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const invalid = { ...hypothesis, description: "" };
            const result = validateHypothesis(invalid);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("描述"))).toBe(true);
        }), { numRuns: 50 });
    });
    it("empty verifyCommand fails validation", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const invalid = { ...hypothesis, verifyCommand: "" };
            const result = validateHypothesis(invalid);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("验证命令"))).toBe(true);
        }), { numRuns: 50 });
    });
    it("empty expectedOutcome fails validation", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const invalid = { ...hypothesis, expectedOutcome: "" };
            const result = validateHypothesis(invalid);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("预期结果"))).toBe(true);
        }), { numRuns: 50 });
    });
    it("all fields empty → 3 errors", () => {
        const result = validateHypothesis({
            description: "",
            verifyCommand: "",
            expectedOutcome: "",
        });
        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(3);
    });
});
// ---------------------------------------------------------------------------
// Property 22b: Debug 假设科学性 (Spec 5 — falsificationTest + blindSpots)
// ---------------------------------------------------------------------------
describe("Property 22b: Debug 假设科学性 (strict mode)", () => {
    it("strict mode: hypothesis with falsificationTest + blindSpots passes", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const strict = {
                ...hypothesis,
                falsificationTest: "swap parameter order and check result",
                blindSpots: ["may be a different root cause upstream"],
            };
            const result = validateHypothesis(strict, { strict: true });
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        }), { numRuns: 50 });
    });
    it("strict mode: missing falsificationTest fails", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const { falsificationTest: _, ...withoutFalsification } = {
                ...hypothesis,
                blindSpots: ["something"],
            };
            const result = validateHypothesis(withoutFalsification, { strict: true });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("证伪"))).toBe(true);
        }), { numRuns: 50 });
    });
    it("strict mode: empty falsificationTest fails", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const result = validateHypothesis({ ...hypothesis, falsificationTest: "  ", blindSpots: ["x"] }, { strict: true });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("证伪"))).toBe(true);
        }), { numRuns: 50 });
    });
    it("strict mode: missing blindSpots fails", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const { blindSpots: _, ...withoutBlindSpots } = {
                ...hypothesis,
                falsificationTest: "some test",
            };
            const result = validateHypothesis(withoutBlindSpots, { strict: true });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("盲点"))).toBe(true);
        }), { numRuns: 50 });
    });
    it("strict mode: empty blindSpots array fails", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const result = validateHypothesis({ ...hypothesis, falsificationTest: "test", blindSpots: [] }, { strict: true });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes("盲点"))).toBe(true);
        }), { numRuns: 50 });
    });
    it("non-strict mode (default): missing falsificationTest + blindSpots still passes", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const result = validateHypothesis(hypothesis);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        }), { numRuns: 50 });
    });
    it("non-strict mode: hypothesis with falsificationTest + blindSpots also passes", () => {
        fc.assert(fc.property(validHypothesisArb, (hypothesis) => {
            const strict = {
                ...hypothesis,
                falsificationTest: "disprove by checking X",
                blindSpots: ["upstream dependency", "concurrency"],
            };
            const result = validateHypothesis(strict);
            expect(result.valid).toBe(true);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Debug phase transitions
// ---------------------------------------------------------------------------
describe("Debug phase transitions", () => {
    it("valid transitions follow the 4-phase order", () => {
        expect(isValidPhaseTransition("collect", "pattern")).toBe(true);
        expect(isValidPhaseTransition("pattern", "hypothesize")).toBe(true);
        expect(isValidPhaseTransition("hypothesize", "fix")).toBe(true);
    });
    it("skipping phases is not allowed", () => {
        expect(isValidPhaseTransition("collect", "hypothesize")).toBe(false);
        expect(isValidPhaseTransition("collect", "fix")).toBe(false);
        expect(isValidPhaseTransition("pattern", "fix")).toBe(false);
    });
    it("backward transitions are not allowed", () => {
        expect(isValidPhaseTransition("fix", "collect")).toBe(false);
        expect(isValidPhaseTransition("hypothesize", "pattern")).toBe(false);
    });
    it("same phase transition is not allowed", () => {
        fc.assert(fc.property(debugPhaseArb, (phase) => {
            expect(isValidPhaseTransition(phase, phase)).toBe(false);
        }), { numRuns: 50 });
    });
    it("getNextPhase returns correct next phase", () => {
        expect(getNextPhase("collect")).toBe("pattern");
        expect(getNextPhase("pattern")).toBe("hypothesize");
        expect(getNextPhase("hypothesize")).toBe("fix");
        expect(getNextPhase("fix")).toBeNull();
    });
    it("getNextPhase covers all phases", () => {
        for (let i = 0; i < DEBUG_PHASES.length - 1; i++) {
            expect(getNextPhase(DEBUG_PHASES[i])).toBe(DEBUG_PHASES[i + 1]);
        }
        expect(getNextPhase(DEBUG_PHASES[DEBUG_PHASES.length - 1])).toBeNull();
    });
});
//# sourceMappingURL=debug.property.test.js.map