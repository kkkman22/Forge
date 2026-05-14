import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hashEvent, isCatalogStale, isThrottled, shouldTriggerEpisodeThreshold, THRESHOLD_MILESTONES, } from "../src/knowledge-hooks.js";
const knowledgeEventArb = fc.oneof(fc.record({ kind: fc.constant("adr_written"), path: fc.string({ minLength: 1 }) }), fc.record({
    kind: fc.constant("solution_written"),
    topic: fc.string({ minLength: 1 }),
    path: fc.string({ minLength: 1 }),
}), fc.record({ kind: fc.constant("instincts_written"), path: fc.string({ minLength: 1 }) }), fc.record({
    kind: fc.constant("known_failures_written"),
    path: fc.string({ minLength: 1 }),
}), fc.record({ kind: fc.constant("glossary_written"), path: fc.string({ minLength: 1 }) }), fc.record({
    kind: fc.constant("episode_threshold_crossed"),
    threshold: fc.nat(),
    count: fc.nat(),
}), fc.record({ kind: fc.constant("catalog_read"), readerSkill: fc.string() }));
describe("knowledge-hooks PBT", () => {
    describe("hashEvent", () => {
        it("is deterministic", () => {
            fc.assert(fc.property(knowledgeEventArb, (event) => {
                expect(hashEvent(event)).toBe(hashEvent(event));
            }));
        });
    });
    describe("isThrottled", () => {
        it("returns true after adding hash", () => {
            fc.assert(fc.property(knowledgeEventArb, (event) => {
                const hashes = new Set([hashEvent(event)]);
                expect(isThrottled(event, hashes, 5000)).toBe(true);
            }));
        });
        it("returns false for empty hash set", () => {
            fc.assert(fc.property(knowledgeEventArb, (event) => {
                expect(isThrottled(event, new Set(), 5000)).toBe(false);
            }));
        });
    });
    describe("isCatalogStale", () => {
        it("monotonic: stale implies stale with larger input mtimes", () => {
            fc.assert(fc.property(fc.nat({ max: 100000 }), fc.array(fc.nat({ max: 100000 }), { minLength: 1 }), fc.nat({ max: 100000 }), (catalogMtime, inputMtimes, extra) => {
                const maxInput = Math.max(...inputMtimes);
                const augmented = [...inputMtimes, maxInput + extra];
                if (isCatalogStale(catalogMtime, inputMtimes)) {
                    expect(isCatalogStale(catalogMtime, augmented)).toBe(true);
                }
            }));
        });
    });
    describe("shouldTriggerEpisodeThreshold", () => {
        it("returns null when previous >= current", () => {
            fc.assert(fc.property(fc.nat({ max: 1000 }), fc.nat({ max: 1000 }), (a, b) => {
                const prev = Math.max(a, b);
                const cur = Math.min(a, b);
                if (prev >= cur) {
                    expect(shouldTriggerEpisodeThreshold(prev, cur)).toBeNull();
                }
            }));
        });
        it("returned milestone is in THRESHOLD_MILESTONES", () => {
            fc.assert(fc.property(fc.nat({ max: 300 }), fc.nat({ max: 300 }), (a, b) => {
                const prev = Math.min(a, b);
                const cur = Math.max(a, b);
                const result = shouldTriggerEpisodeThreshold(prev, cur);
                if (result !== null) {
                    expect(THRESHOLD_MILESTONES).toContain(result);
                }
            }));
        });
    });
});
//# sourceMappingURL=knowledge-hooks.property.test.js.map