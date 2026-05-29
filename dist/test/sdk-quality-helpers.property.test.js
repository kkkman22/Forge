/**
 * Property-based tests for the sdk-quality-helpers module.
 *
 * Covers:
 *   - Property 5: Quality gate helper — phase routing consistency
 *
 * **Validates: Requirements 7.1, 7.4**
 */
import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { evaluateReviewGate, evaluateShipGate, evaluateTestGate } from "../src/quality-gate.js";
import { evaluateGateForPhase } from "../src/sdk-quality-helpers.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Valid YAML frontmatter for review content with p0/p1 counts. */
const reviewContentArb = fc
    .record({
    p0: fc.nat({ max: 10 }),
    p1: fc.nat({ max: 10 }),
})
    .map(({ p0, p1 }) => `---\np0_count: ${p0}\np1_count: ${p1}\n---\n`);
/** Valid YAML frontmatter for test result content. */
const testContentArb = fc
    .record({
    failed: fc.nat({ max: 10 }),
    result: fc.constantFrom("pass", "fail"),
})
    .map(({ failed, result }) => `---\nresult: "${result}"\nfailed: ${failed}\n---\n`);
/** Valid YAML frontmatter for progress content. */
const progressContentArb = fc
    .record({
    total: fc.integer({ min: 1, max: 50 }),
    completed: fc.nat({ max: 50 }),
})
    .map(({ total, completed }) => {
    const capped = Math.min(completed, total);
    return `---\ntotal_tasks: ${total}\ncompleted_tasks: ${capped}\n---\n`;
});
/** Known valid phases. */
const KNOWN_PHASES = new Set(["review", "test", "ship"]);
/**
 * Arbitrary string that is NOT one of the known phases.
 * Filters out "review", "test", and "ship" to generate unknown phase strings.
 */
const unknownPhaseArb = fc
    .string({ minLength: 0, maxLength: 50 })
    .filter((s) => !KNOWN_PHASES.has(s));
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create QualityFileReaders that return the given content strings. */
function makeReaders(review, test, progress) {
    return {
        readReview: () => review,
        readTest: () => test,
        readProgress: () => progress,
    };
}
// ---------------------------------------------------------------------------
// Property 5: Quality gate helper — phase routing consistency
// ---------------------------------------------------------------------------
describe("Property 5: Quality gate helper — phase routing consistency", () => {
    /**
     * **Validates: Requirements 7.1, 7.4**
     *
     * evaluateGateForPhase("review", readers) delegates to evaluateReviewGate
     * and produces the same result as calling evaluateReviewGate directly.
     */
    it("review phase delegates to evaluateReviewGate", () => {
        fc.assert(fc.property(reviewContentArb, testContentArb, progressContentArb, (review, test, progress) => {
            const readers = makeReaders(review, test, progress);
            const helperResult = evaluateGateForPhase("review", readers);
            const directResult = evaluateReviewGate(review);
            expect(helperResult).toEqual(directResult);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 7.1, 7.4**
     *
     * evaluateGateForPhase("test", readers) delegates to evaluateTestGate
     * and produces the same result as calling evaluateTestGate directly.
     */
    it("test phase delegates to evaluateTestGate", () => {
        fc.assert(fc.property(reviewContentArb, testContentArb, progressContentArb, (review, test, progress) => {
            const readers = makeReaders(review, test, progress);
            const helperResult = evaluateGateForPhase("test", readers);
            const directResult = evaluateTestGate(test);
            expect(helperResult).toEqual(directResult);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 7.1, 7.4**
     *
     * evaluateGateForPhase("ship", readers) delegates to evaluateShipGate
     * and produces the same result as calling evaluateShipGate directly.
     */
    it("ship phase delegates to evaluateShipGate", () => {
        fc.assert(fc.property(reviewContentArb, testContentArb, progressContentArb, (review, test, progress) => {
            const readers = makeReaders(review, test, progress);
            const helperResult = evaluateGateForPhase("ship", readers);
            const directResult = evaluateShipGate(review, test, progress);
            expect(helperResult).toEqual(directResult);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 7.1, 7.4**
     *
     * evaluateGateForPhase(<unknown>, readers) returns null for any phase
     * string not in {"review", "test", "ship"}.
     */
    it("unknown phases return null", () => {
        fc.assert(fc.property(unknownPhaseArb, reviewContentArb, testContentArb, progressContentArb, (phase, review, test, progress) => {
            const readers = makeReaders(review, test, progress);
            const result = evaluateGateForPhase(phase, readers);
            expect(result).toBeNull();
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 7.1, 7.4**
     *
     * When readers return null for the required content, evaluateGateForPhase
     * returns null (no gate evaluation occurs).
     */
    it("returns null when review reader returns null for review phase", () => {
        fc.assert(fc.property(testContentArb, progressContentArb, (test, progress) => {
            const readers = makeReaders(null, test, progress);
            const result = evaluateGateForPhase("review", readers);
            expect(result).toBeNull();
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 7.1, 7.4**
     *
     * When the test reader returns null, evaluateGateForPhase("test", ...)
     * returns null.
     */
    it("returns null when test reader returns null for test phase", () => {
        fc.assert(fc.property(reviewContentArb, progressContentArb, (review, progress) => {
            const readers = makeReaders(review, null, progress);
            const result = evaluateGateForPhase("test", readers);
            expect(result).toBeNull();
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 7.1, 7.4**
     *
     * When all readers return null for ship phase, evaluateGateForPhase
     * returns null.
     */
    it("returns null when all readers return null for ship phase", () => {
        const readers = makeReaders(null, null, null);
        const result = evaluateGateForPhase("ship", readers);
        expect(result).toBeNull();
    });
    /**
     * **Validates: Requirements 7.1, 7.4**
     *
     * The review phase only calls readReview, not readTest or readProgress.
     */
    it("review phase only calls readReview reader", () => {
        fc.assert(fc.property(reviewContentArb, (review) => {
            const readReview = vi.fn(() => review);
            const readTest = vi.fn(() => null);
            const readProgress = vi.fn(() => null);
            const readers = {
                readReview,
                readTest,
                readProgress,
            };
            evaluateGateForPhase("review", readers);
            expect(readReview).toHaveBeenCalledOnce();
            expect(readTest).not.toHaveBeenCalled();
            expect(readProgress).not.toHaveBeenCalled();
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 7.1, 7.4**
     *
     * The test phase only calls readTest, not readReview or readProgress.
     */
    it("test phase only calls readTest reader", () => {
        fc.assert(fc.property(testContentArb, (test) => {
            const readReview = vi.fn(() => null);
            const readTest = vi.fn(() => test);
            const readProgress = vi.fn(() => null);
            const readers = {
                readReview,
                readTest,
                readProgress,
            };
            evaluateGateForPhase("test", readers);
            expect(readReview).not.toHaveBeenCalled();
            expect(readTest).toHaveBeenCalledOnce();
            expect(readProgress).not.toHaveBeenCalled();
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 7.1, 7.4**
     *
     * The ship phase calls all three readers.
     */
    it("ship phase calls all three readers", () => {
        fc.assert(fc.property(reviewContentArb, testContentArb, progressContentArb, (review, test, progress) => {
            const readReview = vi.fn(() => review);
            const readTest = vi.fn(() => test);
            const readProgress = vi.fn(() => progress);
            const readers = {
                readReview,
                readTest,
                readProgress,
            };
            evaluateGateForPhase("ship", readers);
            expect(readReview).toHaveBeenCalledOnce();
            expect(readTest).toHaveBeenCalledOnce();
            expect(readProgress).toHaveBeenCalledOnce();
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=sdk-quality-helpers.property.test.js.map