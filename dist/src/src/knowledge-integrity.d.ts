/**
 * Knowledge Integrity Linter — cross-file reference validation and
 * semantic contradiction detection for `.forge/knowledge/`.
 *
 * Motivation
 * ----------
 * Knowledge files reference each other: `instincts.md` patterns cite a
 * `来源` (source) that should correspond to a `solutions/<topic>.md` file;
 * `evolved-rules.md` entries cite `Source` fields that may reference
 * knowledge documents or sessions. When files are renamed, archived, or
 * deleted, these references can break silently.
 *
 * This module provides two lint passes:
 *
 * 1. **Reference integrity** — validates that every cross-file reference
 *    points to an existing file or section. Reports broken links.
 *
 * 2. **Semantic contradiction detection** — finds pairs of knowledge entries
 *    (instincts or solutions) that share significant tag overlap but contain
 *    opposing polarity signals (recommend vs avoid, "do X" vs "never X").
 *    These are flagged for human review, not auto-resolved.
 *
 * Design notes
 * ------------
 * - Pure functions. Inputs are file contents + directory listings; outputs
 *   are structured findings. No IO.
 * - Findings are advisory (severity: "warning"). The learn skill presents
 *   them to the user but does not auto-fix.
 * - The contradiction detector uses simple heuristic keyword matching, not
 *   semantic embeddings. This is intentional: it catches the most common
 *   case (same topic, opposite advice) without requiring a model call.
 *
 * **Wired into**: `/forge learn` step 1 (maintenance) — runs after
 * `maintainKnowledgeBase` and before five-dimension extraction.
 */
/**
 * A single integrity finding.
 *
 * @internal
 */
export interface IntegrityFinding {
    severity: "warning" | "info";
    category: "broken-reference" | "contradiction" | "orphan-solution";
    file: string;
    message: string;
    /** The specific reference or entry that triggered the finding. */
    detail: string;
}
/**
 * Input for the reference integrity check.
 *
 * @internal
 */
export interface IntegrityInput {
    /** Content of `instincts.md`. */
    instinctsContent: string;
    /** Content of `evolved-rules.md`. */
    evolvedRulesContent: string;
    /** Content of `known-failures.md`. */
    knownFailuresContent: string;
    /** Map of topic → content for each `solutions/<topic>.md`. */
    solutions: Map<string, string>;
    /** List of session filenames (without path) in `sessions/`. */
    sessionFiles: string[];
}
/**
 * Check that all cross-file references in knowledge files resolve to
 * existing targets.
 *
 * Checks performed:
 * 1. `instincts.md` `来源` / `**来源**:` fields → must match a solutions/ topic.
 * 2. `evolved-rules.md` `**Source**:` fields → must match a solutions/ topic
 *    or a sessions/ filename (partial match).
 * 3. `evolved-rules.md` `**Infra_Ref**:` paths → not validated here (those
 *    are code paths, validated by `verify-evolved-rule-infra-refs.mjs`).
 *
 * @internal
 */
export declare function checkReferenceIntegrity(input: IntegrityInput): IntegrityFinding[];
/**
 * Detect solutions/ documents that are never referenced by any instinct
 * pattern or evolved rule. These are "orphan" documents that may be
 * candidates for archival.
 *
 * @internal
 */
export declare function checkOrphanSolutions(input: IntegrityInput): IntegrityFinding[];
/**
 * Find pairs of instinct patterns that share ≥ 50% tag overlap but contain
 * opposing polarity signals in their body text.
 *
 * This is a lightweight heuristic: it catches "Pattern A says 'always use X'"
 * vs "Pattern B says 'never use X'" when both are tagged with the same
 * domain. False positives are expected and acceptable — the output is
 * advisory.
 *
 * @internal
 */
export declare function checkContradictions(input: IntegrityInput): IntegrityFinding[];
/**
 * Run all knowledge integrity checks and return combined findings.
 *
 * @internal
 */
export declare function lintKnowledgeIntegrity(input: IntegrityInput): IntegrityFinding[];
