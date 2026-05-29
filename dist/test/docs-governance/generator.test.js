import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildIndex } from "../../src/docs-governance/index-generator/generator.js";
const CATEGORIES = [
    "getting-started",
    "daily-use",
    "advanced",
    "troubleshooting",
    "contributing",
    "reference",
    "audits",
];
const makeFm = (title, category = "reference") => ({
    title,
    category,
    audience: ["maintainer"],
    updated: "2026-05-01",
    owner: "test",
});
const makePair = (slug, title, category = "reference") => ({
    slug,
    directory: "docs",
    cn: {
        path: `docs/${slug}.md`,
        domain: "A",
        frontmatter: makeFm(title, category),
        bodyHash: "",
    },
    state: "cn-only",
});
describe("buildIndex", () => {
    it("produces output with category groups", () => {
        const pairs = [
            makePair("intro", "Introduction", "getting-started"),
            makePair("api", "API Reference", "reference"),
        ];
        const result = buildIndex(pairs);
        expect(result.cn).toContain("## Getting Started");
        expect(result.cn).toContain("## Reference");
    });
    it("omits empty category groups", () => {
        const pairs = [makePair("api", "API", "reference")];
        const result = buildIndex(pairs);
        expect(result.cn).not.toContain("## Getting Started");
        expect(result.cn).toContain("## Reference");
    });
    it("sorts entries by title within category", () => {
        const pairs = [makePair("z-page", "Zebra"), makePair("a-page", "Apple")];
        const result = buildIndex(pairs);
        const lines = result.cn.split("\n");
        const appleIdx = lines.findIndex((l) => l.includes("Apple"));
        const zebraIdx = lines.findIndex((l) => l.includes("Zebra"));
        expect(appleIdx).toBeLessThan(zebraIdx);
    });
    it("ends with footer", () => {
        const result = buildIndex([makePair("x", "X")]);
        expect(result.cn).toContain("scripts/build-docs-index.ts");
    });
    // P4: Generation idempotency
    it("PBT: gen(gen(input)) === gen(input) (idempotency)", () => {
        const categoryArb = fc.constantFrom(...CATEGORIES);
        const pairArb = fc.record({
            slug: fc.string({
                minLength: 1,
                maxLength: 10,
                unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")),
            }),
            title: fc.string({
                minLength: 1,
                maxLength: 20,
                unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz ABCDEF".split("")),
            }),
            category: categoryArb,
        });
        fc.assert(fc.property(fc.array(pairArb, { minLength: 1, maxLength: 20 }), (items) => {
            const pairs = items.map((i) => makePair(i.slug, i.title, i.category));
            const first = buildIndex(pairs);
            const second = buildIndex(pairs);
            expect(first.cn).toBe(second.cn);
        }));
    });
    // P5: Input order independence
    it("PBT: gen(perm1) === gen(perm2) (determinism)", () => {
        const pairs = [
            makePair("b", "B Doc", "reference"),
            makePair("a", "A Doc", "getting-started"),
            makePair("c", "C Doc", "reference"),
        ];
        const reversed = [...pairs].reverse();
        expect(buildIndex(pairs).cn).toBe(buildIndex(reversed).cn);
    });
});
//# sourceMappingURL=generator.test.js.map