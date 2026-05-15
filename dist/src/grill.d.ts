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
import { type TermCandidate } from "./glossary-extractor.js";
/**
 * Alignment categories covered by the decision tree. Every grill session
 * starts with one root node per category to force the user to consider
 * each dimension before deciding.
 */
export type DecisionCategory = "functionality" | "boundary" | "dependency" | "assumption" | "non_goal";
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
export declare function generateDecisionTree(description: string, existingGlossary: Glossary, now?: Date): DecisionTree;
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
export declare function selectNextQuestion(tree: DecisionTree): DecisionTreeNode | null;
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
export declare function applyAnswer(tree: DecisionTree, nodeId: string, answer: string, now?: Date): DecisionTree;
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
export declare function isComplete(tree: DecisionTree): boolean;
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
export declare function extractNewGlossaryCandidates(tree: DecisionTree, existingGlossary: Glossary): TermCandidate[];
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
export declare function renderGrillFindings(tree: DecisionTree, alignmentSummary: string): string;
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
export declare function checkGrillGlossaryConflicts(tree: DecisionTree, glossary: Glossary, now?: Date): GrillConflictCheckResult;
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
export declare function renderGrillConflictPrompt(result: GrillConflictCheckResult): string;
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
export declare function parseGrillFindings(content: string, now?: Date): DecisionTree | null;
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
export declare function resumeGrillFromFindings(content: string, now?: Date): {
    tree: DecisionTree;
    nextNode: DecisionTreeNode | null;
} | null;
import type { FailureContext } from "./failure-sink.js";
export interface GrillAbandonedInput {
    topic: string;
    tier: "light" | "standard" | "full";
    lastPendingNode?: string;
}
export declare function buildGrillAbandonedContext(input: GrillAbandonedInput): FailureContext;
