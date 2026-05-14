/**
 * Tests for the Grill decision-tree operations (Task 4.2):
 *   - selectNextQuestion
 *   - applyAnswer
 *   - isComplete
 *
 * Covers the unit examples and two universal properties called out in
 * the task spec:
 *   - applyAnswer preserves the set of pending node IDs minus the one
 *     just resolved (no new pending nodes introduced).
 *   - Replaying the same (nodeId, answer) sequence on the same initial
 *     tree yields an identical final tree.
 *
 * **Validates: Requirements 4.4, 4.6, 4.8**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyAnswer, generateDecisionTree, isComplete, selectNextQuestion, } from "../src/grill.js";
// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const EMPTY_GLOSSARY = {
    schema_version: 1,
    updated: "2026-05-05",
    terms: [],
};
const GLOSSARY_WITH_REFS = {
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
const FIXED_NOW = new Date("2026-05-05T12:00:00Z");
const LATER_NOW = new Date("2026-05-05T13:00:00Z");
/**
 * Walk the tree and collect every node id whose status is "pending".
 * Used by the property tests to check the "no new pending" invariant.
 */
function collectPendingIds(tree) {
    const out = new Set();
    const visit = (node) => {
        if (node.status === "pending")
            out.add(node.id);
        for (const child of node.children)
            visit(child);
    };
    for (const root of tree.nodes)
        visit(root);
    return out;
}
/** Collect all node ids in a deterministic pre-order traversal. */
function collectAllIds(tree) {
    const out = [];
    const visit = (node) => {
        out.push(node.id);
        for (const child of node.children)
            visit(child);
    };
    for (const root of tree.nodes)
        visit(root);
    return out;
}
// ---------------------------------------------------------------------------
// Unit tests — selectNextQuestion
// ---------------------------------------------------------------------------
describe("selectNextQuestion", () => {
    it("returns the first pending root on a freshly generated tree", () => {
        const tree = generateDecisionTree("Build a login form.", EMPTY_GLOSSARY, FIXED_NOW);
        const next = selectNextQuestion(tree);
        expect(next?.id).toBe("functionality-1");
        expect(next?.status).toBe("pending");
    });
    it("skips resolved roots and returns the next pending root", () => {
        const tree = generateDecisionTree("Build a login form.", EMPTY_GLOSSARY, FIXED_NOW);
        const after = applyAnswer(tree, "functionality-1", "login + logout", FIXED_NOW);
        expect(selectNextQuestion(after)?.id).toBe("boundary-1");
    });
    it("does not descend into children of an unresolved parent", () => {
        const tree = generateDecisionTree("Lock the spec for the 档位 router.", GLOSSARY_WITH_REFS, FIXED_NOW);
        // `dependency-1` has pending children but is itself pending —
        // callers must resolve the parent before the driver surfaces the
        // follow-up questions.
        const next = selectNextQuestion(tree);
        expect(next?.id).toBe("functionality-1");
    });
    it("descends into pending children once the parent is resolved", () => {
        const tree = generateDecisionTree("Lock the spec for the 档位 router.", GLOSSARY_WITH_REFS, FIXED_NOW);
        const resolvedRoots = ["functionality-1", "boundary-1", "dependency-1"].reduce((acc, id) => applyAnswer(acc, id, "answered", FIXED_NOW), tree);
        // Now the dependency root is resolved, so its glossary follow-up
        // children become eligible before the sibling `assumption-1`
        // root.
        expect(selectNextQuestion(resolvedRoots)?.id).toBe("dependency-1-ref-1");
    });
    it("returns null when every node is terminal", () => {
        const tree = {
            rootDescription: "",
            nodes: [
                {
                    id: "root-1",
                    category: "functionality",
                    question: "q",
                    status: "resolved",
                    userAnswer: "a",
                    children: [
                        {
                            id: "root-1-child-1",
                            category: "functionality",
                            question: "q2",
                            status: "skipped",
                            children: [],
                        },
                    ],
                },
            ],
            createdAt: FIXED_NOW.toISOString(),
            lastUpdated: FIXED_NOW.toISOString(),
        };
        expect(selectNextQuestion(tree)).toBeNull();
    });
});
// ---------------------------------------------------------------------------
// Unit tests — applyAnswer
// ---------------------------------------------------------------------------
describe("applyAnswer", () => {
    it("marks the matching node resolved and records the user answer", () => {
        const tree = generateDecisionTree("Build a login form.", EMPTY_GLOSSARY, FIXED_NOW);
        const updated = applyAnswer(tree, "functionality-1", "login + logout", LATER_NOW);
        const target = updated.nodes.find((n) => n.id === "functionality-1");
        expect(target?.status).toBe("resolved");
        expect(target?.userAnswer).toBe("login + logout");
        expect(updated.lastUpdated).toBe(LATER_NOW.toISOString());
    });
    it("returns the same tree reference when nodeId does not exist", () => {
        const tree = generateDecisionTree("Build a login form.", EMPTY_GLOSSARY, FIXED_NOW);
        const updated = applyAnswer(tree, "nonexistent-id", "noop", LATER_NOW);
        expect(updated).toBe(tree);
    });
    it("does not mutate the input tree", () => {
        const tree = generateDecisionTree("Build a login form.", EMPTY_GLOSSARY, FIXED_NOW);
        const snapshot = JSON.stringify(tree);
        applyAnswer(tree, "functionality-1", "login + logout", LATER_NOW);
        expect(JSON.stringify(tree)).toBe(snapshot);
    });
    it("resolves a nested child without touching sibling branches", () => {
        const tree = generateDecisionTree("Lock the spec for the 档位 router.", GLOSSARY_WITH_REFS, FIXED_NOW);
        const updated = applyAnswer(tree, "dependency-1-ref-1", "uses the locked Spec", LATER_NOW);
        const dependency = updated.nodes.find((n) => n.category === "dependency");
        expect(dependency?.children[0].status).toBe("resolved");
        expect(dependency?.children[0].userAnswer).toBe("uses the locked Spec");
        expect(dependency?.children[1].status).toBe("pending");
        // Siblings outside the target branch keep their references.
        const functionality = updated.nodes.find((n) => n.category === "functionality");
        const originalFunctionality = tree.nodes.find((n) => n.category === "functionality");
        expect(functionality).toBe(originalFunctionality);
    });
});
// ---------------------------------------------------------------------------
// Unit tests — isComplete
// ---------------------------------------------------------------------------
describe("isComplete", () => {
    it("returns false on a freshly generated tree with pending roots", () => {
        const tree = generateDecisionTree("Build a login form.", EMPTY_GLOSSARY, FIXED_NOW);
        expect(isComplete(tree)).toBe(false);
    });
    it("returns true once every node is resolved", () => {
        const tree = generateDecisionTree("Build a login form.", EMPTY_GLOSSARY, FIXED_NOW);
        const resolved = collectAllIds(tree).reduce((acc, id) => applyAnswer(acc, id, `answer for ${id}`, FIXED_NOW), tree);
        expect(isComplete(resolved)).toBe(true);
    });
    it("treats deferred and skipped nodes as non-pending", () => {
        const tree = {
            rootDescription: "",
            nodes: [
                {
                    id: "r1",
                    category: "functionality",
                    question: "q",
                    status: "deferred",
                    children: [],
                },
                {
                    id: "r2",
                    category: "boundary",
                    question: "q",
                    status: "skipped",
                    children: [],
                },
            ],
            createdAt: FIXED_NOW.toISOString(),
            lastUpdated: FIXED_NOW.toISOString(),
        };
        expect(isComplete(tree)).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------
const descriptionArb = fc
    .string({ minLength: 1, maxLength: 80 })
    .filter((s) => s.trim().length > 0);
const answerArb = fc.string({ minLength: 1, maxLength: 20 });
describe("Feature: skills-cross-pollination R4, applyAnswer introduces no new pending nodes", () => {
    it("pending set shrinks by exactly the resolved id (or stays identical on miss)", () => {
        fc.assert(fc.property(descriptionArb, answerArb, fc.string(), (description, answer, rawNodeId) => {
            const tree = generateDecisionTree(description, GLOSSARY_WITH_REFS, FIXED_NOW);
            const before = collectPendingIds(tree);
            // Mix of hits (real node ids) and misses (arbitrary strings).
            const candidateIds = [...collectAllIds(tree), rawNodeId];
            for (const candidateId of candidateIds) {
                const after = collectPendingIds(applyAnswer(tree, candidateId, answer, LATER_NOW));
                // No id in `after` may be absent from `before` — applyAnswer
                // must never materialise a brand-new pending node.
                for (const id of after) {
                    expect(before.has(id)).toBe(true);
                }
                // When the id exists, it must drop out of the pending set.
                if (before.has(candidateId)) {
                    expect(after.has(candidateId)).toBe(false);
                }
            }
        }));
    });
});
describe("Feature: skills-cross-pollination R4, applyAnswer replay is deterministic", () => {
    it("same (nodeId, answer) sequence on equal trees produces identical final trees", () => {
        fc.assert(fc.property(descriptionArb, fc.array(fc.tuple(fc.string(), answerArb), { maxLength: 15 }), (description, rawSequence) => {
            const base = generateDecisionTree(description, GLOSSARY_WITH_REFS, FIXED_NOW);
            const ids = collectAllIds(base);
            // Map each arbitrary string to either a real id (modulo) or
            // a deliberate miss, so we exercise both branches while
            // keeping replay determinism.
            const sequence = rawSequence.map(([raw, answer], index) => {
                const useRealId = index % 2 === 0 && ids.length > 0;
                const nodeId = useRealId ? ids[index % ids.length] : raw;
                return [nodeId, answer];
            });
            const replay = (tree) => sequence.reduce((acc, [nodeId, answer]) => applyAnswer(acc, nodeId, answer, LATER_NOW), tree);
            const a = replay(base);
            const b = replay(base);
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        }));
    });
});
//# sourceMappingURL=grill-operations.test.js.map