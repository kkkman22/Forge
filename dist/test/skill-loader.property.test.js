import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadSkillsFromDir, mergeSkillLists } from "../src/skill-loader.js";
const phaseArb = fc.constantFrom("decide", "spec", "plan", "build", "build-light", "review", "test", "ship", "learn", "debug", "fix", "refactor", "loop");
const manifestArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `forge-${s}`),
    version: fc
        .tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }))
        .map(([a, b, c]) => `${a}.${b}.${c}`),
    description: fc.string({ minLength: 1, maxLength: 50 }),
    author: fc.string({ minLength: 1, maxLength: 20 }),
    forgeVersion: fc
        .tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }))
        .map(([a, b, c]) => `>=${a}.${b}.${c}`),
    phases: fc.array(phaseArb, { minLength: 1, maxLength: 3 }),
});
describe("mergeSkillLists properties", () => {
    it("Property 1: builtin always wins on name conflicts (200 iterations)", () => {
        fc.assert(fc.property(fc.array(manifestArb, { maxLength: 20 }), fc.array(manifestArb, { maxLength: 20 }), (builtin, external) => {
            const result = mergeSkillLists(builtin, external);
            const builtinNames = new Set(builtin.map((m) => m.name));
            for (const item of result) {
                if (builtinNames.has(item.name)) {
                    const builtinVersion = builtin.find((b) => b.name === item.name);
                    expect(builtinVersion).toBeDefined();
                    expect(item.version).toBe(builtinVersion.version);
                }
            }
        }), { numRuns: 200 });
    });
    it("Property 2: merged list contains all unique names (200 iterations)", () => {
        fc.assert(fc.property(fc.array(manifestArb, { maxLength: 20 }), fc.array(manifestArb, { maxLength: 20 }), (builtin, external) => {
            const result = mergeSkillLists(builtin, external);
            const allNames = new Set([...builtin, ...external].map((m) => m.name));
            const resultNames = new Set(result.map((m) => m.name));
            expect(resultNames).toEqual(allNames);
        }), { numRuns: 200 });
    });
    it("no duplicate names in result", () => {
        fc.assert(fc.property(fc.array(manifestArb, { maxLength: 20 }), fc.array(manifestArb, { maxLength: 20 }), (builtin, external) => {
            const result = mergeSkillLists(builtin, external);
            const names = result.map((m) => m.name);
            expect(new Set(names).size).toBe(names.length);
        }), { numRuns: 200 });
    });
});
describe("loadSkillsFromDir", () => {
    it("returns empty for empty directory", () => {
        const result = loadSkillsFromDir([], () => undefined);
        expect(result).toEqual([]);
    });
    it("skips directories without skill.json or SKILL.md", () => {
        const result = loadSkillsFromDir(["dir1", "dir2"], () => undefined);
        expect(result).toEqual([]);
    });
    it("loads valid manifests from skill.json", () => {
        const manifest = {
            name: "forge-test",
            version: "1.0.0",
            description: "Test SKILL",
            author: "test",
            forgeVersion: ">=2.0.0",
            phases: ["build"],
        };
        const readFile = (path) => path === "dir1/skill.json" ? JSON.stringify(manifest) : undefined;
        const result = loadSkillsFromDir(["dir1"], readFile);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("forge-test");
    });
});
//# sourceMappingURL=skill-loader.property.test.js.map