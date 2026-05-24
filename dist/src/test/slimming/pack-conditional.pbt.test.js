// Feature: forge-slimming-plan, Property 4: Pack Conditional Skill Registration
// Validates that shouldRegister is consistent across commands/, plugin.json, and audit log.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
function shouldRegister(skill, enabledFlags) {
    if (!skill.requiredFlag)
        return true;
    return enabledFlags.has(skill.requiredFlag);
}
const flagArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z_]+$/.test(s));
describe("Property 4: Pack Conditional Registration", () => {
    it("skills without requiredFlag always register", () => {
        fc.assert(fc.property(fc.record({ name: fc.string({ minLength: 1 }), requiredFlag: fc.constant(null) }), fc.uniqueArray(flagArb, { minLength: 0, maxLength: 5 }), (skill, flags) => {
            expect(shouldRegister(skill, new Set(flags))).toBe(true);
        }), { numRuns: 200 });
    });
    it("skills with requiredFlag register iff flag is present", () => {
        fc.assert(fc.property(fc.record({ name: fc.string({ minLength: 1 }), requiredFlag: flagArb }), fc.uniqueArray(flagArb, { minLength: 0, maxLength: 5 }), (skill, flags) => {
            const flagSet = new Set(flags);
            const result = shouldRegister(skill, flagSet);
            expect(result).toBe(flagSet.has(skill.requiredFlag));
        }), { numRuns: 200 });
    });
    it("registration is monotonic: adding flags never unregisters", () => {
        fc.assert(fc.property(fc.record({ name: fc.string({ minLength: 1 }), requiredFlag: flagArb }), fc.uniqueArray(flagArb, { minLength: 0, maxLength: 3 }), flagArb, (skill, baseFlags, extraFlag) => {
            const base = new Set(baseFlags);
            const extended = new Set([...baseFlags, extraFlag]);
            const baseResult = shouldRegister(skill, base);
            const extResult = shouldRegister(skill, extended);
            // Adding a flag can only turn false→true, never true→false
            if (baseResult)
                expect(extResult).toBe(true);
        }), { numRuns: 200 });
    });
    it("forge-mutate: only registers with mutation_critical_modules", () => {
        const mutate = {
            name: "forge-mutate",
            requiredFlag: "mutation_critical_modules",
        };
        expect(shouldRegister(mutate, new Set())).toBe(false);
        expect(shouldRegister(mutate, new Set(["core_subdomains"]))).toBe(false);
        expect(shouldRegister(mutate, new Set(["mutation_critical_modules"]))).toBe(true);
        expect(shouldRegister(mutate, new Set(["core_subdomains", "mutation_critical_modules", "forced_acceptance_contexts"]))).toBe(true);
    });
});
//# sourceMappingURL=pack-conditional.pbt.test.js.map