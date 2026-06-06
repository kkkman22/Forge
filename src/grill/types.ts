/**
 * Grill decision tree types and constants.
 *
 * @module grill/types
 */

import type { GlossaryTerm } from "../glossary.js";

/**
 * Alignment categories covered by the decision tree.
 */
export type DecisionCategory =
  | "functionality"
  | "boundary"
  | "dependency"
  | "assumption"
  | "non_goal";

/**
 * Lifecycle status of a single decision-tree node.
 */
export type DecisionNodeStatus = "pending" | "resolved" | "deferred" | "skipped";

/**
 * A single node in the decision tree.
 */
export interface DecisionTreeNode {
  id: string;
  category: DecisionCategory;
  question: string;
  status: DecisionNodeStatus;
  aiSuggestion?: string;
  userAnswer?: string;
  children: DecisionTreeNode[];
}

/**
 * Full decision tree produced by generateDecisionTree.
 */
export interface DecisionTree {
  rootDescription: string;
  nodes: DecisionTreeNode[];
  createdAt: string;
  lastUpdated: string;
}

/**
 * A single conflict surfaced while checking grill answers against the
 * shared glossary.
 */
export interface GlossaryConflict {
  type: "synonym" | "avoided_term" | "semantic_mismatch" | "relation_violation";
  term: string;
  detail: string;
  suggestion: string;
}

/**
 * Result of checking grill answers for glossary conflicts.
 */
export interface GrillConflictCheckResult {
  hasConflict: boolean;
  conflictingTerms: Array<{
    candidate: string;
    existing: GlossaryTerm;
    reason: "same_term_different_definition" | "same_alias_different_term";
  }>;
  /** Extended conflicts from avoided-term, semantic-mismatch, and relation-violation checks */
  extendedConflicts: GlossaryConflict[];
}

export interface GrillAbandonedInput {
  topic: string;
  tier: "light" | "standard" | "full";
  lastPendingNode?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ordered list of categories; one root node is produced per entry. */
export const CATEGORY_ORDER: readonly DecisionCategory[] = [
  "functionality",
  "boundary",
  "dependency",
  "assumption",
  "non_goal",
];

/** Default root-level question emitted for each category. */
export const DEFAULT_QUESTIONS: Readonly<Record<DecisionCategory, string>> = {
  functionality: "What are the core user-facing behaviors this needs to support?",
  boundary: "What is explicitly out of scope?",
  dependency: "Which existing modules or external services must this coordinate with?",
  assumption: "What unstated preconditions are being assumed?",
  non_goal: "What is this intentionally NOT trying to achieve?",
};

/**
 * Category under which glossary-term follow-up children are attached.
 */
export const GLOSSARY_FOLLOWUP_PARENT: DecisionCategory = "dependency";
