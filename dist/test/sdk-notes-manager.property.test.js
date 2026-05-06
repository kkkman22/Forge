/**
 * Feature: sdk-driver-decomposition, Property 5: buildIterationEntry field mapping
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildIterationEntry } from "../src/sdk-notes-manager.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary for a valid AgentOutput object with all required fields. */
const agentOutputArb = fc.record({
    success: fc.boolean(),
    summary: fc.string({ maxLength: 200 }),
    key_changes_made: fc.array(fc.string({ maxLength: 100 }), { maxLength: 10 }),
    key_learnings: fc.array(fc.string({ maxLength: 100 }), { maxLength: 10 }),
    should_fully_stop: fc.option(fc.boolean(), { nil: undefined }),
    skill_phase_completed: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
    next_skill_phase: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
    gate_result: fc.option(fc.constantFrom("passed", "blocked", "skipped"), { nil: undefined }),
});
// ---------------------------------------------------------------------------
// Feature: sdk-driver-decomposition, Property 5
// ---------------------------------------------------------------------------
describe("Feature: sdk-driver-decomposition, Property 5: buildIterationEntry field mapping", () => {
    /**
     * **Validates: Requirements 6.4**
     *
     * For any iteration number n, success flag s, and valid AgentOutput o,
     * buildIterationEntry(n, s, o) returns an IterationEntry where:
     * - number === n
     * - success === s
     * - summary === o.summary
     * - keyChanges === (s ? o.key_changes_made : [])
     * - keyLearnings === o.key_learnings
     */
    it("maps all fields correctly for any iteration number, success flag, and AgentOutput", () => {
        fc.assert(fc.property(fc.nat({ max: 10_000 }), fc.boolean(), agentOutputArb, (n, s, o) => {
            const entry = buildIterationEntry(n, s, o);
            // number maps directly from the iteration number parameter
            expect(entry.number).toBe(n);
            // success maps directly from the success flag parameter
            expect(entry.success).toBe(s);
            // summary maps from output.summary
            expect(entry.summary).toBe(o.summary);
            // keyChanges: output.key_changes_made when success=true, [] when false
            if (s) {
                expect(entry.keyChanges).toEqual(o.key_changes_made);
            }
            else {
                expect(entry.keyChanges).toEqual([]);
            }
            // keyLearnings maps from output.key_learnings
            expect(entry.keyLearnings).toEqual(o.key_learnings);
        }), { numRuns: 40 });
    });
});
//# sourceMappingURL=sdk-notes-manager.property.test.js.map