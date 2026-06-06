/**
 * Glossary integration — candidate extraction, conflict detection, and conflict rendering.
 *
 * @module grill/glossary
 */

import type { Glossary } from "../glossary.js";
import {
  DEFAULT_EXTRACTION_RULES,
  extractCandidates,
  filterCandidates,
  type TermCandidate,
} from "../glossary-extractor.js";
import { runGlossaryCheck } from "../glossary-hook.js";
import type {
  DecisionTree,
  DecisionTreeNode,
  GlossaryConflict,
  GrillConflictCheckResult,
} from "./types.js";

// Re-export TermCandidate for consumers that need it
export type { TermCandidate } from "../glossary-extractor.js";

/**
 * Extract new glossary term candidates from a resolved decision tree.
 *
 * **Validates: Requirements 4.5, 4.7**
 */
export function extractNewGlossaryCandidates(
  tree: DecisionTree,
  existingGlossary: Glossary,
): TermCandidate[] {
  const text = collectTreeText(tree);
  const existingNames = collectGlossaryNamesAndAliases(existingGlossary);
  const raw = extractCandidates(text, existingNames);
  return filterCandidates(raw, DEFAULT_EXTRACTION_RULES);
}

/**
 * Check a grill decision tree for glossary conflicts.
 *
 * **Validates: Requirements 4.7**
 */
export function checkGrillGlossaryConflicts(
  tree: DecisionTree,
  glossary: Glossary,
  now: Date = new Date(),
): GrillConflictCheckResult {
  const result = runGlossaryCheck({
    phase: "grill",
    mode: "interactive",
    rawInput: { kind: "decision_tree", tree },
    glossary,
    now,
    alreadyChecked: new Set(),
  });

  const baseConflicts = result.conflicts
    .filter((c): c is typeof c & { reason: NonNullable<typeof c.reason> } => c.reason !== undefined)
    .map((c) => ({
      candidate: c.candidate,
      existing: c.existing,
      reason: c.reason,
    }));

  // --- Extended conflict detection (Task 3.2) ---
  const extendedConflicts: GlossaryConflict[] = [];
  const treeText = collectTreeText(tree).toLowerCase();

  // 1. Avoided-term detection
  for (const term of glossary.terms) {
    if (term.avoided_terms === undefined) continue;
    for (const avoided of term.avoided_terms) {
      const synonymPart = avoided.split(/[（(]/)[0].trim().toLowerCase();
      if (synonymPart.length > 0 && treeText.includes(synonymPart)) {
        extendedConflicts.push({
          type: "avoided_term",
          term: synonymPart,
          detail: `"${synonymPart}" is listed as an avoided term for "${term.term}": ${avoided}`,
          suggestion: `Use "${term.term}" instead of "${synonymPart}".`,
        });
      }
    }
  }

  // 2. Semantic mismatch detection
  for (const term of glossary.terms) {
    const canonicalLower = term.term.toLowerCase();
    if (!treeText.includes(canonicalLower)) continue;
    const relevantAnswers = collectAnswersMentioningTerm(tree, canonicalLower);
    for (const answer of relevantAnswers) {
      const answerLower = answer.toLowerCase();
      const defKeywords = term.definition
        .split(/[，,。.、：:；;（(）)\s]+/)
        .filter((w) => w.length >= 2)
        .map((w) => w.toLowerCase());
      const answerWords = answerLower.split(/\s+/);
      const hasDefOverlap = answerWords.some((w) => defKeywords.includes(w));
      if (!hasDefOverlap && answerLower.length > canonicalLower.length + 5) {
        const aboutPatterns = [
          `${canonicalLower} is`,
          `${canonicalLower}是`,
          `${canonicalLower} means`,
        ];
        const isAboutTerm = aboutPatterns.some((p) => answerLower.includes(p));
        if (isAboutTerm) {
          extendedConflicts.push({
            type: "semantic_mismatch",
            term: term.term,
            detail: `Your glossary defines "${term.term}" as "${term.definition}", but the answer seems to describe something different: "${answer.slice(0, 100)}"`,
            suggestion: `Clarify: does your answer match the glossary definition of "${term.term}"? If not, consider updating the glossary.`,
          });
        }
      }
    }
  }

  // 3. Relation violation detection
  for (const term of glossary.terms) {
    if (term.relations === undefined) continue;
    const canonicalLower = term.term.toLowerCase();
    if (!treeText.includes(canonicalLower)) continue;
    const relevantAnswers = collectAnswersMentioningTerm(tree, canonicalLower);
    for (const answer of relevantAnswers) {
      const answerLower = answer.toLowerCase();
      for (const relation of term.relations) {
        const relationMatch = relation.match(/[→>]\s*(\S+)/);
        if (relationMatch === null) continue;
        const targetTerm = relationMatch[1].replace(/:$/, "").toLowerCase();
        const targetIdx = answerLower.indexOf(targetTerm);
        const canonicalIdx = answerLower.indexOf(canonicalLower);
        if (targetIdx !== -1 && canonicalIdx !== -1 && targetIdx < canonicalIdx) {
          extendedConflicts.push({
            type: "relation_violation",
            term: term.term,
            detail: `Glossary says "${relation}", but the answer suggests the reverse: "${answer.slice(0, 100)}"`,
            suggestion: `Verify the relationship between "${term.term}" and "${targetTerm}" matches the glossary.`,
          });
        }
      }
    }
  }

  return {
    hasConflict: result.hasConflict || extendedConflicts.length > 0,
    conflictingTerms: baseConflicts,
    extendedConflicts,
  };
}

/**
 * Render a user-facing clarification prompt for grill-time glossary conflicts.
 */
export function renderGrillConflictPrompt(result: GrillConflictCheckResult): string {
  if (!result.hasConflict) return "";
  if (result.conflictingTerms.length === 0 && result.extendedConflicts.length === 0) return "";

  const lines: string[] = [];
  const totalConflicts = result.conflictingTerms.length + result.extendedConflicts.length;
  lines.push(`⚠️ Grill glossary conflict detected (${totalConflicts}):`);

  for (const conflict of result.conflictingTerms) {
    lines.push(
      `  - "${conflict.candidate}" vs "${conflict.existing.term}": ${conflict.existing.definition}`,
    );
  }

  for (const conflict of result.extendedConflicts) {
    switch (conflict.type) {
      case "avoided_term":
        lines.push(`  - 🚫 Avoided term: ${conflict.detail}`);
        lines.push(`    → ${conflict.suggestion}`);
        break;
      case "semantic_mismatch":
        lines.push(`  - ⚡ Semantic mismatch: ${conflict.detail}`);
        lines.push(`    → ${conflict.suggestion}`);
        break;
      case "relation_violation":
        lines.push(`  - 🔗 Relation violation: ${conflict.detail}`);
        lines.push(`    → ${conflict.suggestion}`);
        break;
    }
  }

  if (result.conflictingTerms.length > 0) {
    lines.push("请澄清：保留现有 / 替换现有 / 新增别名");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function collectTreeText(tree: DecisionTree): string {
  const parts: string[] = [];
  if (tree.rootDescription.length > 0) parts.push(tree.rootDescription);
  const visit = (node: DecisionTreeNode): void => {
    if (node.question.length > 0) parts.push(node.question);
    if (node.userAnswer !== undefined && node.userAnswer.length > 0) {
      parts.push(node.userAnswer);
    }
    for (const child of node.children) visit(child);
  };
  for (const root of tree.nodes) visit(root);
  return parts.join("\n");
}

function collectGlossaryNamesAndAliases(glossary: Glossary): string[] {
  const out: string[] = [];
  for (const term of glossary.terms) {
    out.push(term.term);
    if (term.aliases !== undefined) {
      for (const alias of term.aliases) out.push(alias);
    }
  }
  return out;
}

function collectAnswersMentioningTerm(tree: DecisionTree, termLower: string): string[] {
  const answers: string[] = [];
  const visit = (node: DecisionTreeNode): void => {
    if (
      node.status === "resolved" &&
      node.userAnswer !== undefined &&
      node.userAnswer.toLowerCase().includes(termLower)
    ) {
      answers.push(node.userAnswer);
    }
    for (const child of node.children) visit(child);
  };
  for (const root of tree.nodes) visit(root);
  return answers;
}
