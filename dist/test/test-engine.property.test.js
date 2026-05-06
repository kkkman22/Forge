/**
 * Property 12: 完成前验证清单完整性
 *
 * Uses fast-check to generate checklist state combinations (7 boolean items),
 * verifying that verification passes ONLY when ALL 7 items are true,
 * and fails when ANY item is false.
 *
 * **Validates: Requirements 7.3**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CHECKLIST_KEYS, CHECKLIST_LABELS, validatePreCompletionChecklist, } from "../src/test-engine.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Generate a checklist state where ALL 7 items are true. */
const allPassChecklistArb = fc.constant({
    testsJustRan: true,
    allTestsPass: true,
    typeCheckPass: true,
    lintPass: true,
    acceptanceCriteria: true,
    noTodoFixme: true,
    progressUpdated: true,
});
/** Generate a checklist state with at least one item false. */
const someFailChecklistArb = fc
    .record({
    testsJustRan: fc.boolean(),
    allTestsPass: fc.boolean(),
    typeCheckPass: fc.boolean(),
    lintPass: fc.boolean(),
    acceptanceCriteria: fc.boolean(),
    noTodoFixme: fc.boolean(),
    progressUpdated: fc.boolean(),
})
    .filter((state) => CHECKLIST_KEYS.some((key) => !state[key]));
/** Generate any checklist state (all combinations of 7 booleans). */
const anyChecklistArb = fc.record({
    testsJustRan: fc.boolean(),
    allTestsPass: fc.boolean(),
    typeCheckPass: fc.boolean(),
    lintPass: fc.boolean(),
    acceptanceCriteria: fc.boolean(),
    noTodoFixme: fc.boolean(),
    progressUpdated: fc.boolean(),
});
/**
 * Generate a checklist state where exactly one specific item is false
 * and all others are true.
 */
const singleFailChecklistArb = fc.constantFrom(...CHECKLIST_KEYS).map((failedKey) => {
    const state = {
        testsJustRan: true,
        allTestsPass: true,
        typeCheckPass: true,
        lintPass: true,
        acceptanceCriteria: true,
        noTodoFixme: true,
        progressUpdated: true,
    };
    state[failedKey] = false;
    return { state, failedKey };
});
// ---------------------------------------------------------------------------
// Property 12: 完成前验证清单完整性
// ---------------------------------------------------------------------------
describe("Property 12: 完成前验证清单完整性", () => {
    it("all 7 items true → verification passes (Req 7.3)", () => {
        fc.assert(fc.property(allPassChecklistArb, (state) => {
            const result = validatePreCompletionChecklist(state);
            expect(result.passed).toBe(true);
            expect(result.failedItems).toHaveLength(0);
        }), { numRuns: 50 });
    });
    it("any item false → verification fails (Req 7.3)", () => {
        fc.assert(fc.property(someFailChecklistArb, (state) => {
            const result = validatePreCompletionChecklist(state);
            expect(result.passed).toBe(false);
            expect(result.failedItems.length).toBeGreaterThan(0);
        }), { numRuns: 50 });
    });
    it("exactly one item false → verification fails with that item listed", () => {
        fc.assert(fc.property(singleFailChecklistArb, ({ state, failedKey }) => {
            const result = validatePreCompletionChecklist(state);
            expect(result.passed).toBe(false);
            expect(result.failedItems).toHaveLength(1);
            expect(result.failedItems[0]).toBe(CHECKLIST_LABELS[failedKey]);
        }), { numRuns: 50 });
    });
    it("for any checklist state, passed ↔ all items true (biconditional)", () => {
        fc.assert(fc.property(anyChecklistArb, (state) => {
            const result = validatePreCompletionChecklist(state);
            const allTrue = CHECKLIST_KEYS.every((key) => state[key]);
            expect(result.passed).toBe(allTrue);
        }), { numRuns: 50 });
    });
    it("failedItems count matches the number of false items", () => {
        fc.assert(fc.property(anyChecklistArb, (state) => {
            const result = validatePreCompletionChecklist(state);
            const falseCount = CHECKLIST_KEYS.filter((key) => !state[key]).length;
            expect(result.failedItems).toHaveLength(falseCount);
        }), { numRuns: 50 });
    });
    it("failedItems contains the correct labels for each false item", () => {
        fc.assert(fc.property(anyChecklistArb, (state) => {
            const result = validatePreCompletionChecklist(state);
            for (const key of CHECKLIST_KEYS) {
                const label = CHECKLIST_LABELS[key];
                if (!state[key]) {
                    expect(result.failedItems).toContain(label);
                }
                else {
                    expect(result.failedItems).not.toContain(label);
                }
            }
        }), { numRuns: 50 });
    });
    it("all 7 items false → 7 failed items returned", () => {
        const allFalse = {
            testsJustRan: false,
            allTestsPass: false,
            typeCheckPass: false,
            lintPass: false,
            acceptanceCriteria: false,
            noTodoFixme: false,
            progressUpdated: false,
        };
        const result = validatePreCompletionChecklist(allFalse);
        expect(result.passed).toBe(false);
        expect(result.failedItems).toHaveLength(7);
    });
});
//# sourceMappingURL=test-engine.property.test.js.map