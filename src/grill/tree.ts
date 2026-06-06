/**
 * Decision tree generation and operations.
 *
 * @module grill/tree
 */

import type { Glossary, GlossaryTerm } from "../glossary.js";
import type { DecisionTree, DecisionTreeNode } from "./types.js";
import { CATEGORY_ORDER, DEFAULT_QUESTIONS, GLOSSARY_FOLLOWUP_PARENT } from "./types.js";

/**
 * Build the initial decision tree for a grill session.
 *
 * **Validates: Requirements 4.4**
 */
export function generateDecisionTree(
  description: string,
  existingGlossary: Glossary,
  now: Date = new Date(),
): DecisionTree {
  const timestamp = now.toISOString();
  const mentioned = findMentionedTerms(description, existingGlossary);

  const nodes: DecisionTreeNode[] = CATEGORY_ORDER.map((category) => {
    const root: DecisionTreeNode = {
      id: `${category}-1`,
      category,
      question: DEFAULT_QUESTIONS[category],
      status: "pending",
      children: [],
    };

    if (category === GLOSSARY_FOLLOWUP_PARENT && mentioned.length > 0) {
      root.children = mentioned.map((term, index) => ({
        id: `${root.id}-ref-${index + 1}`,
        category: GLOSSARY_FOLLOWUP_PARENT,
        question: `How does this decision relate to the existing term "${term.term}"?`,
        status: "pending",
        aiSuggestion: `This decision involves ${term.term}: ${term.definition}`,
        children: [],
      }));
    }

    return root;
  });

  return {
    rootDescription: description,
    nodes,
    createdAt: timestamp,
    lastUpdated: timestamp,
  };
}

/**
 * Return the glossary terms whose canonical name or any alias appears
 * as a substring of `description` (case-insensitive).
 *
 * @internal Exported for testing.
 */
export function findMentionedTerms(description: string, glossary: Glossary): GlossaryTerm[] {
  if (description.length === 0) return [];
  const haystack = description.toLowerCase();

  const needleToTerm = new Map<string, GlossaryTerm>();
  const escapedNeedles: string[] = [];

  for (const term of glossary.terms) {
    const candidates: string[] = [term.term];
    if (term.aliases !== undefined) candidates.push(...term.aliases);

    for (const candidate of candidates) {
      const needle = candidate.trim().toLowerCase();
      if (needle.length === 0) continue;
      needleToTerm.set(needle, term);
      escapedNeedles.push(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    }
  }

  if (escapedNeedles.length === 0) return [];

  const pattern = new RegExp(escapedNeedles.join("|"), "gi");
  const seen = new Set<string>();
  const hits: Array<{ term: GlossaryTerm; firstAt: number }> = [];

  for (const match of haystack.matchAll(pattern)) {
    const needle = match[0].toLowerCase();
    const term = needleToTerm.get(needle);
    if (!term) continue;

    const key = term.term.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    hits.push({ term, firstAt: match.index });
  }

  hits.sort((a, b) => a.firstAt - b.firstAt);
  return hits.map((h) => h.term);
}

/**
 * Pick the next pending question to ask the user.
 *
 * **Validates: Requirements 4.4, 4.6**
 */
export function selectNextQuestion(tree: DecisionTree): DecisionTreeNode | null {
  for (const root of tree.nodes) {
    const found = findEligibleNode(root, true);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Apply a user answer to a decision-tree node, marking it `resolved`.
 *
 * **Validates: Requirements 4.4, 4.6, 4.8**
 */
export function applyAnswer(
  tree: DecisionTree,
  nodeId: string,
  answer: string,
  now: Date = new Date(),
): DecisionTree {
  const updated = updateNodeById(tree.nodes, nodeId, answer);
  if (updated === tree.nodes) return tree;
  return {
    ...tree,
    nodes: updated,
    lastUpdated: now.toISOString(),
  };
}

/**
 * Whether every node in the tree has been answered.
 *
 * **Validates: Requirements 4.4, 4.6**
 */
export function isComplete(tree: DecisionTree): boolean {
  return !hasPendingNode(tree.nodes);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findEligibleNode(
  node: DecisionTreeNode,
  ancestorsResolved: boolean,
): DecisionTreeNode | null {
  if (ancestorsResolved && node.status === "pending") return node;
  if (node.status === "resolved") {
    for (const child of node.children) {
      const found = findEligibleNode(child, true);
      if (found !== null) return found;
    }
  }
  return null;
}

function updateNodeById(
  nodes: DecisionTreeNode[],
  nodeId: string,
  answer: string,
): DecisionTreeNode[] {
  let found = false;
  const next: DecisionTreeNode[] = [];
  for (const node of nodes) {
    if (found) {
      next.push(node);
      continue;
    }
    if (node.id === nodeId) {
      found = true;
      next.push({ ...node, status: "resolved", userAnswer: answer });
      continue;
    }
    const updatedChildren = updateNodeById(node.children, nodeId, answer);
    if (updatedChildren !== node.children) {
      found = true;
      next.push({ ...node, children: updatedChildren });
    } else {
      next.push(node);
    }
  }
  return found ? next : nodes;
}

function hasPendingNode(nodes: DecisionTreeNode[]): boolean {
  for (const node of nodes) {
    if (node.status === "pending") return true;
    if (hasPendingNode(node.children)) return true;
  }
  return false;
}
