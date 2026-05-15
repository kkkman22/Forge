/**
 * Grill Decision Tree — pure generator for Socratic grilling sessions.
 *
 * Given a user's task description and the shared glossary, this module
 * produces the initial decision tree that a `forge-grill` session walks
 * over. The tree has one root node per alignment category
 * (`functionality`, `boundary`, `dependency`, `assumption`, `non_goal`)
 * plus optional follow-up children that reference glossary terms
 * mentioned in the description.
 *
 * The module is intentionally IO-free. All persistence is handled by
 * the driver / skill layer. Later tasks (4.2, 4.3) will add question
 * selection, answer application, completion detection, and findings
 * rendering on top of the types defined here.
 *
 * **Validates: Requirements 4.4**
 */

import type { Glossary, GlossaryTerm } from "./glossary.js";
import {
  DEFAULT_EXTRACTION_RULES,
  extractCandidates,
  filterCandidates,
  type TermCandidate,
} from "./glossary-extractor.js";
import { runGlossaryCheck } from "./glossary-hook.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Alignment categories covered by the decision tree. Every grill session
 * starts with one root node per category to force the user to consider
 * each dimension before deciding.
 */
export type DecisionCategory =
  | "functionality"
  | "boundary"
  | "dependency"
  | "assumption"
  | "non_goal";

/**
 * Lifecycle status of a single decision-tree node.
 *
 *   - `pending`  — awaiting an answer (initial state)
 *   - `resolved` — answered and accepted as final
 *   - `deferred` — parked for a later session
 *   - `skipped`  — explicitly marked not applicable by the user
 */
export type DecisionNodeStatus = "pending" | "resolved" | "deferred" | "skipped";

/**
 * A single node in the decision tree.
 *
 *   - id:           stable, deterministic identifier (e.g. `functionality-1`)
 *   - category:     alignment dimension this node belongs to
 *   - question:     prompt shown to the user / agent
 *   - status:       lifecycle state
 *   - aiSuggestion: optional pre-filled answer the user may accept
 *   - userAnswer:   populated once the user replies
 *   - children:     follow-up nodes; always an array (possibly empty)
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
 * Full decision tree produced by {@link generateDecisionTree}.
 *
 *   - rootDescription: verbatim description supplied by the caller
 *   - nodes:           ordered list of root-level nodes, one per category
 *   - createdAt:       ISO 8601 timestamp when the tree was generated
 *   - lastUpdated:     ISO 8601 timestamp of the last mutation; equals
 *                      `createdAt` on a freshly generated tree
 */
export interface DecisionTree {
  rootDescription: string;
  nodes: DecisionTreeNode[];
  createdAt: string;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ordered list of categories; one root node is produced per entry. */
const CATEGORY_ORDER: readonly DecisionCategory[] = [
  "functionality",
  "boundary",
  "dependency",
  "assumption",
  "non_goal",
];

/** Default root-level question emitted for each category. */
const DEFAULT_QUESTIONS: Readonly<Record<DecisionCategory, string>> = {
  functionality: "What are the core user-facing behaviors this needs to support?",
  boundary: "What is explicitly out of scope?",
  dependency: "Which existing modules or external services must this coordinate with?",
  assumption: "What unstated preconditions are being assumed?",
  non_goal: "What is this intentionally NOT trying to achieve?",
};

/**
 * Category under which glossary-term follow-up children are attached.
 * Glossary mentions signal a dependency on existing terminology, so
 * nesting follow-ups under the `dependency` root keeps IDs stable and
 * matches the intuitive classification.
 */
const GLOSSARY_FOLLOWUP_PARENT: DecisionCategory = "dependency";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the initial decision tree for a grill session.
 *
 * Behaviour:
 *   - Always emits one root node per category (five total), each with a
 *     generic but useful question and `status: "pending"`.
 *   - When `description` mentions a glossary term (case-insensitive on
 *     the canonical name or any alias), appends a follow-up child
 *     under the `dependency` root that references the term via
 *     `aiSuggestion`.
 *   - Root-node IDs are deterministic (`<category>-1`). Follow-up IDs
 *     are `dependency-1-ref-<n>`, indexed in the order terms first
 *     appear in the description.
 *   - `createdAt` and `lastUpdated` default to `new Date()` but accept
 *     an optional `now` parameter so tests can pin the timestamp.
 *
 * This function is pure and performs no IO. Neither argument is
 * mutated; a fresh tree is returned on every call.
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return the glossary terms whose canonical name or any alias appears
 * as a substring of `description` (case-insensitive). Ordering follows
 * the first occurrence in the description so follow-up child IDs are
 * reproducible across calls.
 *
 * Terms whose canonical name and all aliases are blank are skipped
 * (defensive: the glossary parser tolerates malformed fragments).
 */
function findMentionedTerms(description: string, glossary: Glossary): GlossaryTerm[] {
  if (description.length === 0) return [];
  const haystack = description.toLowerCase();

  const seen = new Set<string>();
  const hits: Array<{ term: GlossaryTerm; firstAt: number }> = [];

  for (const term of glossary.terms) {
    const candidates: string[] = [term.term];
    if (term.aliases !== undefined) candidates.push(...term.aliases);

    let firstAt = -1;
    for (const candidate of candidates) {
      const needle = candidate.trim().toLowerCase();
      if (needle.length === 0) continue;
      const at = haystack.indexOf(needle);
      if (at !== -1 && (firstAt === -1 || at < firstAt)) {
        firstAt = at;
      }
    }

    const key = term.term.trim().toLowerCase();
    if (firstAt !== -1 && key.length > 0 && !seen.has(key)) {
      seen.add(key);
      hits.push({ term, firstAt });
    }
  }

  hits.sort((a, b) => a.firstAt - b.firstAt);
  return hits.map((h) => h.term);
}

// ---------------------------------------------------------------------------
// Decision-tree operations (Task 4.2)
// ---------------------------------------------------------------------------

/**
 * Pick the next pending question to ask the user.
 *
 * Traversal:
 *   1. Walk {@link DecisionTree.nodes} in order (roots first).
 *   2. For each root, depth-first search descending into children.
 *   3. Return the first node whose `status === "pending"` and whose
 *      ancestors (if any) are all `resolved`.
 *
 * Root-level nodes have no ancestors, so they are eligible as soon as
 * they are pending. Non-resolved roots block descent into their
 * children, which keeps the grill session from jumping ahead past an
 * un-answered parent question.
 *
 * Returns `null` when every node is already terminal (resolved,
 * deferred, or skipped), signalling that the caller should inspect
 * {@link isComplete} and move on.
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
 * Behaviour:
 *   - Traverses the tree depth-first and matches by `id`.
 *   - On hit, returns a new tree with the target node's `status` set
 *     to `"resolved"`, `userAnswer` set to the supplied `answer`, and
 *     `lastUpdated` bumped to `now.toISOString()`.
 *   - Does NOT create new pending nodes — follow-up children are only
 *     added at generation time.
 *   - On miss (unknown `nodeId`), returns the original `tree` reference
 *     unchanged. Callers can use reference equality as a cheap way to
 *     detect misses.
 *
 * Pure: input trees are never mutated. Sibling and ancestor nodes that
 * are not on the path to the target keep their references, which keeps
 * downstream diffs cheap.
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
 * Whether every node in the tree has been answered (or otherwise
 * taken out of the pending queue via `deferred`/`skipped`).
 *
 * Returns `true` when no descendant anywhere in the tree has
 * `status === "pending"`. An empty `tree.nodes` array is treated as
 * complete — the grill driver always seeds the five category roots
 * before this check runs, so the edge case is defensive rather than
 * expected.
 *
 * **Validates: Requirements 4.4, 4.6**
 */
export function isComplete(tree: DecisionTree): boolean {
  return !hasPendingNode(tree.nodes);
}

// ---------------------------------------------------------------------------
// Internal helpers for tree operations
// ---------------------------------------------------------------------------

/**
 * Depth-first search for the next eligible pending node.
 *
 * A node is eligible when it is pending and every ancestor along the
 * path to it is `resolved`. Descent into children only happens when
 * the current node itself is resolved; deferred or skipped branches
 * are effectively dormant until the user revisits them.
 */
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

/**
 * Recursively rebuild `nodes` with the matching `nodeId` marked
 * resolved. Returns the original array reference when no match is
 * found so {@link applyAnswer} can short-circuit.
 */
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

/** Recursively check whether any node in the forest is still pending. */
function hasPendingNode(nodes: DecisionTreeNode[]): boolean {
  for (const node of nodes) {
    if (node.status === "pending") return true;
    if (hasPendingNode(node.children)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Glossary candidates & findings rendering (Task 4.3)
// ---------------------------------------------------------------------------

/**
 * Extract new glossary term candidates from a resolved decision tree.
 *
 * Collects the text surface the user produced during the grill session
 * (`rootDescription` + every node's `question` + every `userAnswer`) and
 * runs it through the shared glossary extractor with
 * {@link DEFAULT_EXTRACTION_RULES}. Terms already present in the
 * supplied glossary (canonical name or any alias) are filtered out by
 * `extractCandidates` itself, so the returned list only contains
 * candidates worth presenting to the user for potential merge.
 *
 * Tree traversal is depth-first and node order follows the order of
 * {@link DecisionTree.nodes} with children visited after their parent.
 * Descending into `deferred` / `skipped` branches is intentional: their
 * questions and any partial answers may still have introduced new
 * terminology worth surfacing.
 *
 * This function is pure: same input → same output, no IO, no RNG.
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
 * Render the `findings/grill-<topic>.md` body for a completed grill
 * session.
 *
 * Output sections (fixed order, each preceded by a blank line):
 *
 *   1. `# Grill Findings: <first non-empty line of rootDescription>`
 *   2. `## Decision Tree` — nested bullet list; each node line is
 *      `- [STATUS] <category>/<id>: <question>`; `userAnswer` (when
 *      present) appears indented under the node as `Answer: <text>`.
 *   3. `## Q&A Pairs` — one bullet per *resolved* node in depth-first
 *      order: `- Q: <question>` followed by `  A: <userAnswer>`. Nodes
 *      whose status is not `resolved` are omitted.
 *   4. `## Alignment Summary` — the caller-provided summary verbatim;
 *      falls back to an empty placeholder when blank so the section
 *      header is never orphaned.
 *   5. `## New Glossary Candidates` — bullet list formatted as
 *      `- <term> (<frequency>)`; collapses to the single word `none`
 *      when the list is empty.
 *
 * The function is pure and performs no IO. The output always ends with
 * a trailing newline so downstream renderers can append further
 * content without adjacency glitches.
 *
 * **Validates: Requirements 4.5**
 */
export function renderGrillFindings(tree: DecisionTree, alignmentSummary: string): string {
  const candidates = extractNewGlossaryCandidates(tree, EMPTY_GLOSSARY_FOR_RENDER);
  return renderGrillFindingsWithCandidates(tree, alignmentSummary, candidates);
}

/**
 * Internal variant of {@link renderGrillFindings} that accepts a
 * pre-computed candidate list. Exposed so callers that already ran
 * {@link extractNewGlossaryCandidates} against the real glossary can
 * avoid re-extracting against an empty one.
 *
 * Not exported: behavioural contract lives on the public function.
 */
function renderGrillFindingsWithCandidates(
  tree: DecisionTree,
  alignmentSummary: string,
  candidates: TermCandidate[],
): string {
  const title = extractTitle(tree.rootDescription);
  const lines: string[] = [];

  lines.push(`# Grill Findings: ${title}`);
  lines.push("");
  lines.push("## Decision Tree");
  lines.push("");
  for (const root of tree.nodes) {
    renderTreeNode(root, 0, lines);
  }

  lines.push("");
  lines.push("## Q&A Pairs");
  lines.push("");
  const qaLines = renderQAPairs(tree.nodes);
  if (qaLines.length === 0) {
    lines.push("none");
  } else {
    for (const line of qaLines) lines.push(line);
  }

  lines.push("");
  lines.push("## Alignment Summary");
  lines.push("");
  const summaryBody = alignmentSummary.trim().length > 0 ? alignmentSummary : "none";
  lines.push(summaryBody);

  lines.push("");
  lines.push("## New Glossary Candidates");
  lines.push("");
  if (candidates.length === 0) {
    lines.push("none");
  } else {
    for (const c of candidates) {
      lines.push(`- ${c.term} (${c.frequency})`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers — findings rendering
// ---------------------------------------------------------------------------

/**
 * Placeholder glossary used by the public `renderGrillFindings` entry
 * point. Callers that want glossary-aware filtering should use
 * {@link extractNewGlossaryCandidates} separately and drive rendering
 * through their own driver layer.
 */
const EMPTY_GLOSSARY_FOR_RENDER: Glossary = {
  schema_version: 1,
  updated: "",
  terms: [],
};

/**
 * Concatenate every piece of human-written text the tree carries so
 * the extractor has a single string to scan. Order matters only for
 * the context snippets attached to candidates, not for filter
 * behaviour.
 */
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

/**
 * Gather every canonical term name plus every alias from a glossary
 * into a flat string[] so `extractCandidates` can exclude them.
 */
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

/**
 * Extract the first non-empty line of `description` to use as the
 * findings title. Falls back to `"(untitled)"` so the heading is
 * never blank.
 */
function extractTitle(description: string): string {
  for (const line of description.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "(untitled)";
}

/**
 * Render a single decision-tree node (plus its descendants) into the
 * nested bullet-list accumulator. Indentation is two spaces per level,
 * consistent with the rest of the Forge markdown conventions.
 */
function renderTreeNode(node: DecisionTreeNode, depth: number, lines: string[]): void {
  const indent = "  ".repeat(depth);
  const status = node.status.toUpperCase();
  lines.push(`${indent}- [${status}] ${node.category}/${node.id}: ${node.question}`);
  if (node.userAnswer !== undefined && node.userAnswer.length > 0) {
    lines.push(`${indent}  Answer: ${node.userAnswer}`);
  }
  for (const child of node.children) {
    renderTreeNode(child, depth + 1, lines);
  }
}

/**
 * Collect resolved-only Q&A lines in depth-first order. Nodes whose
 * status is not `resolved` are skipped; descending into their
 * children is still allowed so a resolved leaf under a deferred
 * parent is not accidentally hidden.
 */
function renderQAPairs(nodes: DecisionTreeNode[]): string[] {
  const lines: string[] = [];
  const visit = (node: DecisionTreeNode): void => {
    if (node.status === "resolved" && node.userAnswer !== undefined) {
      lines.push(`- Q: ${node.question}`);
      lines.push(`  A: ${node.userAnswer}`);
    }
    for (const child of node.children) visit(child);
  };
  for (const root of nodes) visit(root);
  return lines;
}

// ---------------------------------------------------------------------------
// Glossary conflict detection for grill rounds (Task 4.6)
// NOTE: constants GRILL_CONFLICT_DEFINITION_MAX_LENGTH and
// GRILL_CONFLICT_DEFAULT_DATE removed — now handled by glossary-hook.
// ---------------------------------------------------------------------------

/**
 * A single conflict surfaced while checking grill answers against the
 * shared glossary.
 *
 * Fields:
 *   - `candidate`: the surface term extracted from grill text (tree
 *                  description, questions, or `userAnswer`)
 *   - `existing`:  the glossary entry that clashes with the candidate
 *   - `reason`:    the conflict category propagated from
 *                  `detectConflict` (`same_term_different_definition`
 *                  or `same_alias_different_term`)
 */
export interface GrillConflictCheckResult {
  hasConflict: boolean;
  conflictingTerms: Array<{
    candidate: string;
    existing: GlossaryTerm;
    reason: "same_term_different_definition" | "same_alias_different_term";
  }>;
}

/**
 * Check a grill decision tree for glossary conflicts introduced by the
 * user's answers (or by the root description / question prompts).
 *
 * Pipeline:
 *   1. Collect candidate surface terms from every piece of text the
 *      tree carries (`rootDescription`, each node's `question`, and
 *      each resolved `userAnswer`). We intentionally run the shared
 *      extractor with an *empty* existing-terms list so that surface
 *      forms matching existing glossary entries still reach
 *      `detectConflict` — the whole point of the grill-time conflict
 *      check is to catch the user redefining a known term with a
 *      different meaning.
 *   2. Apply {@link DEFAULT_EXTRACTION_RULES} to keep candidate noise
 *      low (same thresholds as the findings renderer).
 *   3. For each candidate, build a provisional `GlossaryTerm` whose
 *      `definition` is the candidate's context snippet truncated to
 *      `GRILL_CONFLICT_DEFINITION_MAX_LENGTH` characters, and
 *      `last_updated` is `now`'s ISO date. The provisional term is
 *      never persisted; it exists only to hand a well-formed shape
 *      to `detectConflict`.
 *   4. Call `detectConflict(glossary, provisional)` and record every
 *      reported clash together with the candidate surface form and
 *      the conflicting existing term.
 *
 * The function is pure and performs no IO; neither argument is
 * mutated. Ordering follows the candidate order returned by
 * `filterCandidates` (frequency desc, term asc) so replays are
 * deterministic.
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
  return {
    hasConflict: result.hasConflict,
    conflictingTerms: result.conflicts
      .filter(
        (c): c is typeof c & { reason: NonNullable<typeof c.reason> } => c.reason !== undefined,
      )
      .map((c) => ({
        candidate: c.candidate,
        existing: c.existing,
        reason: c.reason,
      })),
  };
}

/**
 * Render a user-facing clarification prompt for grill-time glossary
 * conflicts.
 *
 * Returns an empty string when `result.hasConflict` is false, so
 * callers can compose the driver output unconditionally. Otherwise
 * produces a message mirroring the decide-phase clarification prompt
 * (see `renderDecideGlossaryConflictPrompt` in `src/decide.ts`), so
 * downstream CLI surfaces can render both consistently:
 *
 *   ⚠️ Grill glossary conflict detected ({N}):
 *     - "<candidate>" vs "<existing.term>": <existing.definition>
 *     ...
 *   请澄清：保留现有 / 替换现有 / 新增别名
 */
export function renderGrillConflictPrompt(result: GrillConflictCheckResult): string {
  if (!result.hasConflict || result.conflictingTerms.length === 0) return "";

  const lines: string[] = [];
  lines.push(`⚠️ Grill glossary conflict detected (${result.conflictingTerms.length}):`);
  for (const conflict of result.conflictingTerms) {
    lines.push(
      `  - "${conflict.candidate}" vs "${conflict.existing.term}": ${conflict.existing.definition}`,
    );
  }
  lines.push("请澄清：保留现有 / 替换现有 / 新增别名");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers — grill conflict detection (retained for reference)
// NOTE: truncateDefinition and safeIsoDate were removed as unused after
// migrating checkGrillGlossaryConflicts to use glossary-hook.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Findings parsing & resume support (Task 4.7)
// ---------------------------------------------------------------------------

/**
 * Allowed decision-tree categories rendered by
 * {@link renderGrillFindings}. Kept as a `Set` so lookup is O(1) and
 * the parser can cheaply validate surface forms before casting.
 */
const DECISION_CATEGORY_SET: ReadonlySet<string> = new Set<DecisionCategory>([
  "functionality",
  "boundary",
  "dependency",
  "assumption",
  "non_goal",
]);

/**
 * Allowed node statuses. Tracked separately from the TypeScript union
 * so the parser can reject stray or mis-capitalised surface forms
 * without touching the type layer.
 */
const DECISION_STATUS_SET: ReadonlySet<string> = new Set<DecisionNodeStatus>([
  "pending",
  "resolved",
  "deferred",
  "skipped",
]);

/** Matches a tree-node bullet produced by `renderTreeNode`. */
const FINDINGS_NODE_LINE = /^( *)- \[([A-Z]+)\] (\w+)\/([\w-]+): (.+)$/;

/** Matches the `Answer: ...` line attached to the most recent node. */
const FINDINGS_ANSWER_LINE = /^( +)Answer: (.+)$/;

/** Matches the H1 heading `# Grill Findings: <title>`. */
const FINDINGS_TITLE_LINE = /^# Grill Findings: (.*)$/;

/** Marker for the start of the decision-tree section. */
const FINDINGS_DECISION_TREE_HEADER = "## Decision Tree";

/**
 * Parse a `findings/grill-<topic>.md` file back into a
 * {@link DecisionTree}.
 *
 * This is the inverse of {@link renderGrillFindings} at the structural
 * level, with two deliberate losses:
 *
 *   - `rootDescription` is reconstructed from the H1 title line only.
 *     The original description may have spanned multiple lines; we
 *     recover the first non-empty line that {@link renderGrillFindings}
 *     picked as the title.
 *   - `aiSuggestion` is never rendered and therefore is not restored.
 *   - `createdAt` / `lastUpdated` are not rendered either; both fields
 *     are populated with the current time so the returned tree can
 *     still be fed back into {@link applyAnswer} without breaking its
 *     `lastUpdated` invariant.
 *
 * Parsing rules:
 *   - Each node line follows `^( *)- \[(STATUS)\] (category)/(id): (question)$`.
 *   - Two-space indentation per nesting level (matches the renderer).
 *   - An immediately-following `^( +)Answer: (text)$` line whose
 *     indent equals `(parentDepth + 1) * 2` sets `userAnswer` on the
 *     most recently opened node. Misaligned answer lines are ignored.
 *   - Unknown categories / statuses or malformed indentation cause the
 *     offending line to be skipped; the surrounding tree is still
 *     returned when at least one root node parsed successfully.
 *
 * Returns `null` when the content is missing a `## Decision Tree`
 * section entirely or when no valid root node could be recovered.
 *
 * Pure: no IO, no mutation of the input string.
 *
 * **Validates: Requirements 4.10**
 */
export function parseGrillFindings(content: string, now: Date = new Date()): DecisionTree | null {
  const lines = content.split("\n");

  // Locate H1 title (optional) and ## Decision Tree (required).
  let title: string | null = null;
  let treeStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (title === null) {
      const titleMatch = FINDINGS_TITLE_LINE.exec(line);
      if (titleMatch !== null) {
        title = titleMatch[1].trim();
      }
    }
    if (line === FINDINGS_DECISION_TREE_HEADER) {
      treeStart = i;
      break;
    }
  }

  if (treeStart === -1) return null;

  const roots: DecisionTreeNode[] = [];
  const stack: Array<{ depth: number; node: DecisionTreeNode }> = [];

  for (let i = treeStart + 1; i < lines.length; i++) {
    const line = lines[i];
    // Subsequent `## ` heading terminates the decision-tree block.
    if (line.startsWith("## ")) break;

    const nodeMatch = FINDINGS_NODE_LINE.exec(line);
    if (nodeMatch !== null) {
      const parsed = parseFindingsNodeLine(nodeMatch);
      if (parsed === null) continue;

      // Pop any stack frame at this depth or deeper; the frame that
      // survives (if any) is the parent.
      while (stack.length > 0 && stack[stack.length - 1].depth >= parsed.depth) {
        stack.pop();
      }

      if (parsed.depth === 0) {
        roots.push(parsed.node);
      } else {
        const top = stack[stack.length - 1];
        if (top === undefined || top.depth !== parsed.depth - 1) {
          // Orphan child (no matching parent indent) — skip silently.
          continue;
        }
        top.node.children.push(parsed.node);
      }

      stack.push({ depth: parsed.depth, node: parsed.node });
      continue;
    }

    const answerMatch = FINDINGS_ANSWER_LINE.exec(line);
    if (answerMatch !== null && stack.length > 0) {
      const top = stack[stack.length - 1];
      const expectedIndent = (top.depth + 1) * 2;
      if (answerMatch[1].length === expectedIndent) {
        top.node.userAnswer = answerMatch[2];
      }
    }
  }

  if (roots.length === 0) return null;

  const timestamp = now.toISOString();
  return {
    rootDescription: title ?? "",
    nodes: roots,
    createdAt: timestamp,
    lastUpdated: timestamp,
  };
}

/**
 * Resume helper that glues {@link parseGrillFindings} and
 * {@link selectNextQuestion} together. Given the raw contents of a
 * `findings/grill-<topic>.md` file, returns both the reconstructed
 * tree and the node the grill loop should ask next.
 *
 *   - Returns `null` when {@link parseGrillFindings} cannot recover a
 *     tree (missing / malformed decision-tree section).
 *   - `nextNode` is `null` when every node in the recovered tree has
 *     already been resolved / deferred / skipped, i.e. the session is
 *     complete and the caller should fall through to findings
 *     rendering instead of resuming the loop.
 *
 * Pure: same inputs → same outputs. The grill driver layer is
 * expected to invoke this helper when `.forge/status.md.phase ===
 * "grill_abandoned"` so that `/forge resume` can continue the
 * session from the exact pending node where the user left off.
 *
 * **Validates: Requirements 4.10**
 */
export function resumeGrillFromFindings(
  content: string,
  now: Date = new Date(),
): { tree: DecisionTree; nextNode: DecisionTreeNode | null } | null {
  const tree = parseGrillFindings(content, now);
  if (tree === null) return null;
  return { tree, nextNode: selectNextQuestion(tree) };
}

// ---------------------------------------------------------------------------
// Internal helpers — findings parsing
// ---------------------------------------------------------------------------

/**
 * Convert a regex match on {@link FINDINGS_NODE_LINE} into a fully
 * typed {@link DecisionTreeNode} plus its depth. Returns `null` when
 * the indentation is odd, the status is unknown, or the category is
 * not one of the five allowed values — in each case the caller skips
 * the offending line.
 */
function parseFindingsNodeLine(
  match: RegExpExecArray,
): { depth: number; node: DecisionTreeNode } | null {
  const indent = match[1];
  const statusRaw = match[2];
  const category = match[3];
  const id = match[4];
  const question = match[5];

  if (indent.length % 2 !== 0) return null;
  const depth = indent.length / 2;

  const status = statusRaw.toLowerCase();
  if (!DECISION_STATUS_SET.has(status)) return null;
  if (!DECISION_CATEGORY_SET.has(category)) return null;

  return {
    depth,
    node: {
      id,
      category: category as DecisionCategory,
      question,
      status: status as DecisionNodeStatus,
      children: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Failure-sink driver helper
// ---------------------------------------------------------------------------

import type { FailureContext } from "./failure-sink.js";

export interface GrillAbandonedInput {
  topic: string;
  tier: "light" | "standard" | "full";
  lastPendingNode?: string;
}

export function buildGrillAbandonedContext(input: GrillAbandonedInput): FailureContext {
  return {
    skill: "forge-grill",
    topic: input.topic,
    tier: input.tier,
    trigger: "grill_abandoned",
    situation: input.lastPendingNode
      ? `需求澄清中止，最后待决节点：${input.lastPendingNode}`
      : "需求澄清被用户中止",
    rootCause: input.lastPendingNode
      ? `未完成边界对齐，最后待决问题：${input.lastPendingNode}`
      : undefined,
  };
}
