/**
 * Unit and integration tests for Task 4.7:
 *   - `parseGrillFindings` — parses a rendered findings Markdown back
 *     into a `DecisionTree` so `/tinkerman resume` can pick up where a
 *     `grill_abandoned` session left off.
 *   - `resumeGrillFromFindings` — thin helper wrapping parse +
 *     `selectNextQuestion` for driver-layer callers.
 *
 * **Validates: Requirements 4.10**
 */

import { describe, expect, it } from "vitest";
import type { Glossary } from "../src/glossary.js";
import {
  applyAnswer,
  type DecisionTree,
  type DecisionTreeNode,
  generateDecisionTree,
  parseGrillFindings,
  renderGrillFindings,
  resumeGrillFromFindings,
  selectNextQuestion,
} from "../src/grill.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-05-05T12:00:00Z");
const RESUME_NOW = new Date("2026-05-06T09:30:00Z");

const EMPTY_GLOSSARY: Glossary = {
  schema_version: 1,
  updated: "2026-05-05",
  terms: [],
};

/**
 * Walk a tree depth-first and collect every node with a predicate.
 * Keeps the tests agnostic to the internal shape of the tree.
 */
function collect(tree: DecisionTree, predicate: (n: DecisionTreeNode) => boolean): string[] {
  const out: string[] = [];
  const visit = (node: DecisionTreeNode): void => {
    if (predicate(node)) out.push(node.id);
    for (const child of node.children) visit(child);
  };
  for (const root of tree.nodes) visit(root);
  return out;
}

/**
 * Find a node by id anywhere in the forest. Returns `undefined` when
 * absent so assertions can make the failure obvious.
 */
function findNode(tree: DecisionTree, id: string): DecisionTreeNode | undefined {
  const walk = (node: DecisionTreeNode): DecisionTreeNode | undefined => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const hit = walk(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  for (const root of tree.nodes) {
    const hit = walk(root);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * Structural comparison helper. Ignores `createdAt`, `lastUpdated`,
 * and `aiSuggestion` (none of which survive a render → parse round
 * trip) but checks every id / status / userAnswer / question /
 * category / children order.
 */
function structuralShape(tree: DecisionTree): Array<
  Pick<DecisionTreeNode, "id" | "category" | "question" | "status" | "userAnswer"> & {
    children: ReturnType<typeof structuralShape>;
  }
> {
  const map = (node: DecisionTreeNode): ReturnType<typeof structuralShape>[number] => ({
    id: node.id,
    category: node.category,
    question: node.question,
    status: node.status,
    ...(node.userAnswer !== undefined ? { userAnswer: node.userAnswer } : {}),
    children: node.children.map(map),
  });
  return tree.nodes.map(map);
}

// ---------------------------------------------------------------------------
// parseGrillFindings — basic shape
// ---------------------------------------------------------------------------

describe("parseGrillFindings", () => {
  it("returns null for content missing the Decision Tree section", () => {
    const content = "# Grill Findings: test\n\n## Q&A Pairs\n\nnone\n";
    expect(parseGrillFindings(content, RESUME_NOW)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseGrillFindings("", RESUME_NOW)).toBeNull();
  });

  it("returns null when the Decision Tree section has no valid node lines", () => {
    const content = "# Grill Findings: stub\n\n## Decision Tree\n\n(no nodes yet)\n";
    expect(parseGrillFindings(content, RESUME_NOW)).toBeNull();
  });

  it("recovers the rootDescription from the H1 title line", () => {
    const tree = generateDecisionTree("Resume the pipeline.", EMPTY_GLOSSARY, FIXED_NOW);
    const rendered = renderGrillFindings(tree, "summary");
    const parsed = parseGrillFindings(rendered, RESUME_NOW);
    expect(parsed).not.toBeNull();
    if (parsed === null) throw new Error("unreachable");
    expect(parsed.rootDescription).toBe("Resume the pipeline.");
  });

  it("populates createdAt and lastUpdated from the `now` argument", () => {
    const tree = generateDecisionTree("Resume the pipeline.", EMPTY_GLOSSARY, FIXED_NOW);
    const rendered = renderGrillFindings(tree, "");
    const parsed = parseGrillFindings(rendered, RESUME_NOW);
    if (parsed === null) throw new Error("expected parse success");
    expect(parsed.createdAt).toBe(RESUME_NOW.toISOString());
    expect(parsed.lastUpdated).toBe(RESUME_NOW.toISOString());
  });
});

// ---------------------------------------------------------------------------
// Round-trip: render → parse → structurally identical tree
// ---------------------------------------------------------------------------

describe("parseGrillFindings round-trip", () => {
  it("restores all five root categories from a freshly generated tree", () => {
    const tree = generateDecisionTree("Resume the pipeline.", EMPTY_GLOSSARY, FIXED_NOW);
    const rendered = renderGrillFindings(tree, "");
    const parsed = parseGrillFindings(rendered, RESUME_NOW);
    if (parsed === null) throw new Error("expected parse success");

    const categories = parsed.nodes.map((n) => n.category);
    expect(categories).toEqual([
      "functionality",
      "boundary",
      "dependency",
      "assumption",
      "non_goal",
    ]);
    for (const node of parsed.nodes) {
      expect(node.status).toBe("pending");
    }
  });

  it("preserves the resolved/pending mix and userAnswer after a full round trip", () => {
    const base = generateDecisionTree("Resume the pipeline.", EMPTY_GLOSSARY, FIXED_NOW);
    const withFunc = applyAnswer(
      base,
      "functionality-1",
      "Export batches of orders on demand.",
      FIXED_NOW,
    );
    const withBoundary = applyAnswer(
      withFunc,
      "boundary-1",
      "Out of scope: streaming and PDF rendering.",
      FIXED_NOW,
    );

    const rendered = renderGrillFindings(withBoundary, "aligned on CSV/JSON only");
    const parsed = parseGrillFindings(rendered, RESUME_NOW);
    if (parsed === null) throw new Error("expected parse success");

    expect(structuralShape(parsed)).toEqual(structuralShape(withBoundary));
  });

  it("recovers nested glossary-follow-up children under the dependency root", () => {
    const glossary: Glossary = {
      schema_version: 1,
      updated: "2026-05-05",
      terms: [
        {
          term: "Tier",
          definition: "Complexity dimension controlling routing.",
          last_updated: "2026-05-05",
        },
      ],
    };
    const tree = generateDecisionTree("Refactor Tier routing.", glossary, FIXED_NOW);
    const rendered = renderGrillFindings(tree, "");
    const parsed = parseGrillFindings(rendered, RESUME_NOW);
    if (parsed === null) throw new Error("expected parse success");

    const dependencyRoot = parsed.nodes.find((n) => n.id === "dependency-1");
    expect(dependencyRoot).toBeDefined();
    expect(dependencyRoot?.children.length).toBe(1);
    expect(dependencyRoot?.children[0].id).toBe("dependency-1-ref-1");
    expect(dependencyRoot?.children[0].category).toBe("dependency");
    expect(dependencyRoot?.children[0].status).toBe("pending");
  });

  it("is tolerant of extra trailing sections (Q&A / summary / candidates)", () => {
    const tree = generateDecisionTree("With extras.", EMPTY_GLOSSARY, FIXED_NOW);
    const resolved = applyAnswer(tree, "functionality-1", "A basic answer", FIXED_NOW);
    const rendered = renderGrillFindings(resolved, "Summary text here.");
    // Ensure the parser still only considers the Decision Tree section.
    const parsed = parseGrillFindings(rendered, RESUME_NOW);
    if (parsed === null) throw new Error("expected parse success");
    expect(parsed.nodes.length).toBe(5);
    expect(findNode(parsed, "functionality-1")?.userAnswer).toBe("A basic answer");
  });
});

// ---------------------------------------------------------------------------
// resumeGrillFromFindings — integration helper
// ---------------------------------------------------------------------------

describe("resumeGrillFromFindings", () => {
  it("returns null when the findings content is unusable", () => {
    expect(resumeGrillFromFindings("", RESUME_NOW)).toBeNull();
    expect(resumeGrillFromFindings("# Just a heading", RESUME_NOW)).toBeNull();
  });

  it("identifies the first pending node as the next question", () => {
    const base = generateDecisionTree("Ship it.", EMPTY_GLOSSARY, FIXED_NOW);
    const resolved = applyAnswer(base, "functionality-1", "Core behaviour X", FIXED_NOW);
    const rendered = renderGrillFindings(resolved, "partial alignment");

    const result = resumeGrillFromFindings(rendered, RESUME_NOW);
    if (result === null) throw new Error("expected a parsed tree");

    expect(result.nextNode).not.toBeNull();
    // functionality-1 was resolved — the next pending root is boundary-1.
    expect(result.nextNode?.id).toBe("boundary-1");
    // The returned next node must actually belong to the returned tree.
    expect(selectNextQuestion(result.tree)?.id).toBe(result.nextNode?.id);
  });

  it("returns nextNode=null when every node in the recovered tree is terminal", () => {
    const base = generateDecisionTree("Done.", EMPTY_GLOSSARY, FIXED_NOW);
    const pendingIds = collect(base, (n) => n.status === "pending");
    const fully = pendingIds.reduce(
      (acc, id) => applyAnswer(acc, id, `answered ${id}`, FIXED_NOW),
      base,
    );
    const rendered = renderGrillFindings(fully, "all aligned");

    const result = resumeGrillFromFindings(rendered, RESUME_NOW);
    if (result === null) throw new Error("expected a parsed tree");
    expect(result.nextNode).toBeNull();
  });

  it("end-to-end: 2 resolved + 3 pending roots → resume picks the first pending", () => {
    const base = generateDecisionTree("Mixed state task.", EMPTY_GLOSSARY, FIXED_NOW);
    // Resolve two roots; leave the remaining three pending.
    const step1 = applyAnswer(base, "functionality-1", "user-facing behaviour", FIXED_NOW);
    const step2 = applyAnswer(step1, "boundary-1", "out of scope list", FIXED_NOW);

    const rendered = renderGrillFindings(step2, "");
    const result = resumeGrillFromFindings(rendered, RESUME_NOW);
    if (result === null) throw new Error("expected a parsed tree");

    // The recovered tree must still mark the three remaining roots as pending.
    const pending = collect(result.tree, (n) => n.status === "pending");
    expect(pending).toEqual(["dependency-1", "assumption-1", "non_goal-1"]);

    // And the resume cursor must land on the first of those pending roots.
    expect(result.nextNode?.id).toBe("dependency-1");

    // User answers that were captured before the abandonment survive.
    expect(findNode(result.tree, "functionality-1")?.userAnswer).toBe("user-facing behaviour");
    expect(findNode(result.tree, "boundary-1")?.userAnswer).toBe("out of scope list");
  });
});
