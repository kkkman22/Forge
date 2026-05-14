/**
 * Property-based tests for the Grill decision-tree generator (Task 4.1).
 *
 * Covers the universal properties called out in the design doc and
 * requirement 4.4 / 4.8:
 *   - Any non-empty description yields a non-empty tree covering all
 *     five alignment categories
 *   - The generator never throws on arbitrary string input
 *   - Node IDs are deterministic across calls with identical inputs
 *
 * **Validates: Requirements 4.4**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateDecisionTree } from "../src/grill.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Any non-empty description string (arbitrary Unicode tolerated). */
const nonEmptyDescriptionArb = fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.length > 0);
/** Safe glossary term name for use in generators. */
const termNameArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .map((s) => s.replace(/[\n\r#]/g, "").trim())
    .filter((s) => s.length > 0);
const definitionArb = fc
    .string({ minLength: 1, maxLength: 40 })
    .map((s) => s.replace(/[\n\r]/g, " ").trim())
    .filter((s) => s.length > 0);
const termArb = fc.record({
    term: termNameArb,
    definition: definitionArb,
    last_updated: fc.constant("2026-05-05"),
});
const glossaryArb = fc.record({
    schema_version: fc.constant(1),
    updated: fc.constant("2026-05-05"),
    terms: fc.array(termArb, { maxLength: 5 }),
});
const EMPTY_GLOSSARY = {
    schema_version: 1,
    updated: "2026-05-05",
    terms: [],
};
const CATEGORIES = [
    "functionality",
    "boundary",
    "dependency",
    "assumption",
    "non_goal",
];
const FIXED_NOW = new Date("2026-05-05T12:00:00Z");
// ---------------------------------------------------------------------------
// Property: non-empty description → tree with all five categories
// ---------------------------------------------------------------------------
describe("Feature: skills-cross-pollination R4, generateDecisionTree covers five categories", () => {
    it("any non-empty description yields five root nodes, one per category", () => {
        fc.assert(fc.property(nonEmptyDescriptionArb, glossaryArb, (description, glossary) => {
            const tree = generateDecisionTree(description, glossary, FIXED_NOW);
            expect(tree.nodes.length).toBeGreaterThanOrEqual(5);
            expect(tree.rootDescription).toBe(description);
            const rootCategories = tree.nodes.map((n) => n.category);
            for (const category of CATEGORIES) {
                expect(rootCategories).toContain(category);
            }
            // Every root node starts pending and has a non-empty question.
            for (const node of tree.nodes) {
                expect(node.status).toBe("pending");
                expect(node.question.length).toBeGreaterThan(0);
                expect(Array.isArray(node.children)).toBe(true);
            }
        }));
    });
});
// ---------------------------------------------------------------------------
// Property: generator never throws
// ---------------------------------------------------------------------------
describe("Feature: skills-cross-pollination R4, generateDecisionTree is total", () => {
    it("never throws for arbitrary string input", () => {
        fc.assert(fc.property(fc.string(), glossaryArb, (description, glossary) => {
            expect(() => generateDecisionTree(description, glossary, FIXED_NOW)).not.toThrow();
        }));
    });
});
// ---------------------------------------------------------------------------
// Property: deterministic node IDs
// ---------------------------------------------------------------------------
describe("Feature: skills-cross-pollination R4, generateDecisionTree is deterministic", () => {
    it("two calls with the same inputs produce identical IDs and structure", () => {
        fc.assert(fc.property(nonEmptyDescriptionArb, glossaryArb, (description, glossary) => {
            const a = generateDecisionTree(description, glossary, FIXED_NOW);
            const b = generateDecisionTree(description, glossary, FIXED_NOW);
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        }));
    });
});
// ---------------------------------------------------------------------------
// Unit examples
// ---------------------------------------------------------------------------
describe("generateDecisionTree unit examples", () => {
    it("emits deterministic root-node IDs `<category>-1`", () => {
        const tree = generateDecisionTree("Build a login form.", EMPTY_GLOSSARY, FIXED_NOW);
        expect(tree.nodes.map((n) => n.id)).toEqual([
            "functionality-1",
            "boundary-1",
            "dependency-1",
            "assumption-1",
            "non_goal-1",
        ]);
        expect(tree.createdAt).toBe("2026-05-05T12:00:00.000Z");
        expect(tree.lastUpdated).toBe("2026-05-05T12:00:00.000Z");
    });
    it("handles empty descriptions by still emitting all five category roots", () => {
        const tree = generateDecisionTree("", EMPTY_GLOSSARY, FIXED_NOW);
        expect(tree.nodes.map((n) => n.category)).toEqual([
            "functionality",
            "boundary",
            "dependency",
            "assumption",
            "non_goal",
        ]);
        for (const node of tree.nodes) {
            expect(node.children).toEqual([]);
            expect(node.status).toBe("pending");
        }
    });
    it("attaches glossary follow-up children when the description mentions a term", () => {
        const glossary = {
            schema_version: 1,
            updated: "2026-05-05",
            terms: [
                { term: "Spec", definition: "Locked-in requirement.", last_updated: "2026-05-05" },
                {
                    term: "Tier",
                    definition: "Complexity dimension.",
                    aliases: ["档位"],
                    last_updated: "2026-05-05",
                },
            ],
        };
        const tree = generateDecisionTree("Lock the spec for the 档位 router.", glossary, FIXED_NOW);
        const dependency = tree.nodes.find((n) => n.category === "dependency");
        expect(dependency).toBeDefined();
        // Children ordered by first occurrence in the description:
        //   "spec" appears at index 9, "档位" at index 21 → Spec first, Tier second.
        expect(dependency?.children.map((c) => c.id)).toEqual([
            "dependency-1-ref-1",
            "dependency-1-ref-2",
        ]);
        expect(dependency?.children[0].aiSuggestion).toContain("Spec");
        expect(dependency?.children[1].aiSuggestion).toContain("Tier");
        for (const child of dependency?.children ?? []) {
            expect(child.status).toBe("pending");
        }
    });
    it("does not attach follow-ups when no glossary term is mentioned", () => {
        const glossary = {
            schema_version: 1,
            updated: "2026-05-05",
            terms: [{ term: "Hint", definition: "Router hint tag.", last_updated: "2026-05-05" }],
        };
        const tree = generateDecisionTree("Refactor the logging module.", glossary, FIXED_NOW);
        for (const node of tree.nodes) {
            expect(node.children).toEqual([]);
        }
    });
});
//# sourceMappingURL=grill.property.test.js.map