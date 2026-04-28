/**
 * Property-based tests for the SKILL phase commit strategy.
 *
 * Covers:
 *   - Property 12: SKILL 阶段 commit 策略一致性
 *
 * **Validates: Requirements 11.1, 11.3, 11.4, 11.5**
 */
// Feature: loop-skills-fusion, Property 12: SKILL 阶段 commit 策略一致性
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { shouldCommitForPhase } from "../src/skill-scheduler.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Phases that produce code/plan changes and should trigger a commit on success. */
const COMMITABLE_PHASES = ["build", "plan", "fix"];
/** Phases that do NOT produce committable changes. */
const NON_COMMITABLE_PHASES = ["review", "test", "ship", "router", "learn"];
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary commitable phase. */
const commitablePhaseArb = fc.constantFrom(...COMMITABLE_PHASES);
/** Arbitrary non-commitable phase. */
const nonCommitablePhaseArb = fc.constantFrom(...NON_COMMITABLE_PHASES);
/** Arbitrary phase from either set. */
const anyKnownPhaseArb = fc.constantFrom(...COMMITABLE_PHASES, ...NON_COMMITABLE_PHASES);
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 12: SKILL 阶段 commit 策略一致性
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 12: SKILL 阶段 commit 策略一致性", () => {
    /**
     * **Validates: Requirements 11.1, 11.3, 11.5**
     *
     * Commitable phases (build, plan, fix) with success=true → returns true.
     */
    it("commitable phases with success=true return true", () => {
        fc.assert(fc.property(commitablePhaseArb, (phase) => {
            expect(shouldCommitForPhase(phase, true)).toBe(true);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.4**
     *
     * Non-commitable phases (review, test, ship, router, learn) with success=true → returns false.
     */
    it("non-commitable phases with success=true return false", () => {
        fc.assert(fc.property(nonCommitablePhaseArb, (phase) => {
            expect(shouldCommitForPhase(phase, true)).toBe(false);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.1, 11.3, 11.4, 11.5**
     *
     * Any phase with success=false → returns false.
     */
    it("any phase with success=false returns false", () => {
        fc.assert(fc.property(anyKnownPhaseArb, (phase) => {
            expect(shouldCommitForPhase(phase, false)).toBe(false);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 11.1, 11.3, 11.4, 11.5**
     *
     * Deterministic: same inputs always produce the same output.
     */
    it("deterministic — same inputs always produce the same output", () => {
        fc.assert(fc.property(anyKnownPhaseArb, fc.boolean(), (phase, success) => {
            const result1 = shouldCommitForPhase(phase, success);
            const result2 = shouldCommitForPhase(phase, success);
            expect(result1).toBe(result2);
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=skill-commit.property.test.js.map