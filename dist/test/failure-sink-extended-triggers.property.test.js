/**
 * Property-based tests for failure-sink covering all 8 triggers.
 *
 * Validates:
 *   - Episode generation is deterministic (idempotent)
 *   - Every trigger produces a non-empty lesson
 *   - Episode IDs increment correctly across triggers
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildFailureEpisode, } from "../src/failure-sink.js";
const ALL_TRIGGERS = [
    "three_strike",
    "new_review_pattern",
    "ship_gate_blocked",
    "debug_resolved",
    "grill_abandoned",
    "test_layer_failed",
    "conflict_validation_failed",
    "loop_circuit_broken",
    "replan_triggered",
];
const triggerArb = fc.constantFrom(...ALL_TRIGGERS);
const contextArb = triggerArb.chain((trigger) => fc.record({
    skill: fc.string({ minLength: 1, maxLength: 20 }),
    topic: fc.string({ minLength: 1, maxLength: 30 }),
    tier: fc.constantFrom("light", "standard", "full"),
    trigger: fc.constant(trigger),
    situation: fc.string({ minLength: 1, maxLength: 100 }),
    rootCause: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
}));
describe("failure-sink PBT — all triggers", () => {
    it("buildFailureEpisode is deterministic (idempotent)", () => {
        fc.assert(fc.property(contextArb, fc.date({ noInvalidDate: true }), fc.integer({ min: 1, max: 999 }), (ctx, now, seq) => {
            const a = buildFailureEpisode(ctx, now, seq);
            const b = buildFailureEpisode(ctx, now, seq);
            expect(a).toEqual(b);
        }));
    });
    it("every trigger produces a non-empty lesson", () => {
        for (const trigger of ALL_TRIGGERS) {
            const ctx = {
                skill: "test-skill",
                topic: "test-topic",
                tier: "standard",
                trigger,
                situation: "test",
            };
            const ep = buildFailureEpisode(ctx, new Date("2026-05-14T00:00:00Z"), 1);
            expect(ep.lesson.length).toBeGreaterThan(0);
        }
    });
    it("episode id increments with sequenceInDay across triggers", () => {
        const base = new Date("2026-05-14T00:00:00Z");
        const ids = ALL_TRIGGERS.map((trigger, i) => {
            const ctx = {
                skill: "test-skill",
                topic: "test",
                tier: "standard",
                trigger,
                situation: "test",
            };
            return buildFailureEpisode(ctx, base, i + 1).id;
        });
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) {
            expect(id).toMatch(/^ep-2026-05-14-\d{3}$/);
        }
    });
});
//# sourceMappingURL=failure-sink-extended-triggers.property.test.js.map