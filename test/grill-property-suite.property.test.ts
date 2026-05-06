/**
 * Consolidated property-test suite for the Grill decision tree
 * (Task 4.8). Three universal properties pinned by the spec:
 *
 *   1. After applying an answer to every pending node the tree
 *      surfaces, every LEAF node ends up with status === "resolved".
 *      (No dangling pending/deferred/skipped leaves when the driver
 *      actually answers everything it is asked.)
 *
 *   2. Replaying the same (tree, answer sequence, alignment summary)
 *      through `renderGrillFindings` is deterministic — same bytes in,
 *      same bytes out, which is what lets callers diff a findings file
 *      against a regenerated copy to detect drift.
 *
 *   3. `generateDecisionTree` is total — it never throws for any
 *      combination of description string and glossary input. This
 *      property is also asserted in `grill.property.test.ts`; keeping
 *      a mirror here documents the Task 4.8 contract in one place.
 *
 * **Validates: Requirements 4.8**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Glossary, GlossaryTerm } from "../src/glossary.js";
import {
  applyAnswer,
  type DecisionTree,
  type DecisionTreeNode,
  generateDecisionTree,
  renderGrillFindings,
  selectNextQuestion,
} from "../src/grill.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Any description string, including empty — used for totality check. */
const anyDescriptionArb = fc.string({ maxLength: 200 });

/** Non-empty descriptions are the realistic driver input. */
const nonEmptyDescriptionArb = fc
  .string({ minLength: 1, maxLength: 120 })
  .filter((s) => s.trim().length > 0);

/** Glossary term names that survive the parser's whitespace trimming. */
const termNameArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .map((s) => s.replace(/[\n\r#]/g, "").trim())
  .filter((s) => s.length > 0);

const definitionArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .map((s) => s.replace(/[\n\r]/g, " ").trim())
  .filter((s) => s.length > 0);

const termArb: fc.Arbitrary<GlossaryTerm> = fc.record({
  term: termNameArb,
  definition: definitionArb,
  last_updated: fc.constant("2026-05-05"),
});

const glossaryArb: fc.Arbitrary<Glossary> = fc.record({
  schema_version: fc.constant(1),
  updated: fc.constant("2026-05-05"),
  terms: fc.array(termArb, { maxLength: 4 }),
});

const answerArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .map((s) => s.replace(/[\n\r]/g, " "))
  .filter((s) => s.trim().length > 0);

const summaryArb = fc.string({ maxLength: 80 }).map((s) => s.replace(/[\n\r]/g, " "));

const FIXED_NOW = new Date("2026-05-05T12:00:00Z");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect every node in pre-order so tests can walk the full tree
 * without reimplementing recursion in each case.
 */
function collectAllNodes(tree: DecisionTree): DecisionTreeNode[] {
  const out: DecisionTreeNode[] = [];
  const visit = (node: DecisionTreeNode): void => {
    out.push(node);
    for (const child of node.children) visit(child);
  };
  for (const root of tree.nodes) visit(root);
  return out;
}

/**
 * Drive the tree to completion by repeatedly asking for the next
 * pending question and resolving it. Uses a bounded loop guard so a
 * regression that made `selectNextQuestion` stop shrinking the pending
 * set would surface as a test timeout rather than hang the process.
 */
function resolveEveryPending(tree: DecisionTree, answer: string): DecisionTree {
  let current = tree;
  const totalNodes = collectAllNodes(tree).length;
  for (let step = 0; step <= totalNodes; step += 1) {
    const next = selectNextQuestion(current);
    if (next === null) return current;
    const after = applyAnswer(current, next.id, answer, FIXED_NOW);
    if (after === current) {
      // Defensive: applyAnswer should always make progress when
      // selectNextQuestion returned a real node id.
      throw new Error(`applyAnswer failed to advance for node id=${next.id}`);
    }
    current = after;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Property 1: every leaf ends up resolved once the driver answers all
// pending questions the tree surfaces.
// ---------------------------------------------------------------------------

describe("Feature: skills-cross-pollination R4.8, every leaf resolves after full traversal", () => {
  it("after answering every pending node, all leaf nodes have status === 'resolved'", () => {
    fc.assert(
      fc.property(
        nonEmptyDescriptionArb,
        glossaryArb,
        answerArb,
        (description, glossary, answer) => {
          const initial = generateDecisionTree(description, glossary, FIXED_NOW);
          const resolved = resolveEveryPending(initial, answer);

          // Sanity — the driver really did reach a terminal state.
          expect(selectNextQuestion(resolved)).toBeNull();

          // Every leaf must be resolved. Non-leaf (ancestor) nodes are
          // also resolved in practice because selectNextQuestion only
          // descends once the parent is resolved, but the property the
          // spec pins is the leaf guarantee.
          for (const node of collectAllNodes(resolved)) {
            if (node.children.length === 0) {
              expect(node.status).toBe("resolved");
            }
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: replay determinism of renderGrillFindings.
// ---------------------------------------------------------------------------

describe("Feature: skills-cross-pollination R4.8, replay yields identical alignment summary", () => {
  it("same (tree, answer sequence, summary) replays to byte-identical findings", () => {
    fc.assert(
      fc.property(
        nonEmptyDescriptionArb,
        glossaryArb,
        fc.array(answerArb, { maxLength: 10 }),
        summaryArb,
        (description, glossary, answers, summary) => {
          const base = generateDecisionTree(description, glossary, FIXED_NOW);

          const replay = (): DecisionTree => {
            let current = base;
            for (const answer of answers) {
              const next = selectNextQuestion(current);
              if (next === null) break;
              current = applyAnswer(current, next.id, answer, FIXED_NOW);
            }
            return current;
          };

          const first = renderGrillFindings(replay(), summary);
          const second = renderGrillFindings(replay(), summary);
          expect(first).toBe(second);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: generateDecisionTree is total.
// ---------------------------------------------------------------------------

describe("Feature: skills-cross-pollination R4.8, generateDecisionTree never throws", () => {
  it("is total over arbitrary description and glossary inputs", () => {
    fc.assert(
      fc.property(anyDescriptionArb, glossaryArb, (description, glossary) => {
        expect(() => generateDecisionTree(description, glossary, FIXED_NOW)).not.toThrow();
      }),
    );
  });
});
