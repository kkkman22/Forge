/**
 * Feature: sdk-driver-decomposition, Property 3: Commit effect filtering for non-commitable phases
 * Feature: sdk-driver-decomposition, Property 4: Commit message format correctness
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applySkillAwareCommitStrategy, buildCommitMessageForPhase, } from "../src/sdk-commit-strategy.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/**
 * Non-commitable phases — phases where shouldCommitForPhase returns false
 * even when success=true. Derived from skill-scheduler.ts COMMITABLE_PHASES.
 */
const NON_COMMITABLE_PHASES = [
    "review",
    "test",
    "ship",
    "router",
    "learn",
    "refactor-scan",
    "fix-analyze",
    "completed",
    "aborted",
];
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary for a single commit effect. */
const commitEffectArb = fc
    .string({ minLength: 1, maxLength: 80 })
    .map((msg) => ({ type: "commit", message: msg }));
/** Arbitrary for non-commit effects (all other OrchestratorEffect variants). */
const nonCommitEffectArb = fc.oneof(fc.record({
    type: fc.constant("schedule_iteration"),
    iterationNumber: fc.nat({ max: 100 }),
}), fc.record({
    type: fc.constant("rollback"),
}), fc.record({
    type: fc.constant("stop"),
}), fc.record({
    type: fc.constant("abort"),
    reason: fc.string({ minLength: 1, maxLength: 50 }),
}), fc.record({
    type: fc.constant("start_backoff"),
    durationMs: fc.nat({ max: 300_000 }),
}));
/**
 * Arbitrary for an effects array that contains at least one commit effect.
 * Generates a mix of commit and non-commit effects, then shuffles them.
 */
const effectsWithAtLeastOneCommitArb = fc
    .tuple(fc.array(commitEffectArb, { minLength: 1, maxLength: 5 }), fc.array(nonCommitEffectArb, { minLength: 0, maxLength: 5 }))
    .chain(([commits, others]) => {
    const combined = [...commits, ...others];
    // Shuffle the combined array
    return fc.shuffledSubarray(combined, {
        minLength: combined.length,
        maxLength: combined.length,
    });
});
/** Arbitrary for a non-commitable phase string. */
const nonCommitablePhaseArb = fc.constantFrom(...NON_COMMITABLE_PHASES);
// ---------------------------------------------------------------------------
// Feature: sdk-driver-decomposition, Property 3
// ---------------------------------------------------------------------------
describe("Feature: sdk-driver-decomposition, Property 3: Commit effect filtering for non-commitable phases", () => {
    /**
     * **Validates: Requirements 5.4**
     *
     * For any effects array containing at least one commit effect, and for any
     * non-commitable phase with success=true, applySkillAwareCommitStrategy
     * returns an effects array with zero commit effects and a stateAdjustment
     * that decrements commitCount.
     */
    it("removes all commit effects and returns stateAdjustment for non-commitable phases with success=true", () => {
        fc.assert(fc.property(effectsWithAtLeastOneCommitArb, nonCommitablePhaseArb, fc.nat({ max: 1000 }), fc.string({ maxLength: 200 }), fc.string({ maxLength: 200 }), fc.nat({ max: 100 }), (effects, phase, iterationNumber, summary, objective, currentCommitCount) => {
            const result = applySkillAwareCommitStrategy(effects, phase, true, // success=true
            iterationNumber, summary, objective, currentCommitCount);
            // No commit effects in the result
            const commitEffectsInResult = result.effects.filter((e) => e.type === "commit");
            expect(commitEffectsInResult).toHaveLength(0);
            // All non-commit effects are preserved
            const nonCommitInputEffects = effects.filter((e) => e.type !== "commit");
            const nonCommitOutputEffects = result.effects.filter((e) => e.type !== "commit");
            expect(nonCommitOutputEffects).toEqual(nonCommitInputEffects);
            // stateAdjustment is present and decrements commitCount
            expect(result.stateAdjustment).toBeDefined();
            expect(result.stateAdjustment?.commitCount).toBe(Math.max(0, currentCommitCount - 1));
        }), { numRuns: 40 });
    });
});
// ---------------------------------------------------------------------------
// Constants for Property 4
// ---------------------------------------------------------------------------
/**
 * Commitable phases — phases where shouldCommitForPhase returns true
 * when success=true. Derived from skill-scheduler.ts COMMITABLE_PHASES.
 */
const COMMITABLE_PHASES = [
    "build",
    "build-light",
    "plan",
    "fix",
    "refactor-apply",
    "fix-apply",
];
// ---------------------------------------------------------------------------
// Feature: sdk-driver-decomposition, Property 4
// ---------------------------------------------------------------------------
describe("Feature: sdk-driver-decomposition, Property 4: Commit message format correctness", () => {
    /** Arbitrary for a commitable phase string. */
    const commitablePhaseArb = fc.constantFrom(...COMMITABLE_PHASES);
    /**
     * **Validates: Requirements 5.5**
     *
     * For any commitable phase, iteration number, and summary string,
     * buildCommitMessageForPhase returns a string matching the pattern
     * `forge(<label>): <content>` where <label> is derived from the phase
     * and <content> is derived from the summary or a phase-specific template.
     *
     * Note: some phases use a shortened label in the commit message
     * (e.g. "fix-apply" → "fix", "refactor-apply" → "refactor").
     */
    it("returns a message matching forge(<label>): <content> for any commitable phase", () => {
        /** Maps input phase to the label used in the commit message prefix. */
        const phaseToLabel = {
            build: "build",
            "build-light": "build-light",
            plan: "plan",
            fix: "fix",
            "fix-apply": "fix",
            "refactor-apply": "refactor",
        };
        fc.assert(fc.property(commitablePhaseArb, fc.nat({ max: 1000 }), fc.string({ minLength: 1, maxLength: 200 }), fc.string({ minLength: 1, maxLength: 200 }), (phase, iterationNumber, summary, objective) => {
            const result = buildCommitMessageForPhase(phase, iterationNumber, summary, objective);
            // Must start with forge(<label>): where label is derived from the phase
            const label = phaseToLabel[phase] ?? phase;
            const prefix = `forge(${label}): `;
            expect(result.startsWith(prefix)).toBe(true);
            // Content after the prefix must be non-empty
            const content = result.slice(prefix.length);
            expect(content.length).toBeGreaterThan(0);
        }), { numRuns: 40 });
    });
});
//# sourceMappingURL=sdk-commit-strategy.property.test.js.map