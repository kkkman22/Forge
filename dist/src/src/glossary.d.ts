/**
 * Glossary Registry — types, parser, and renderer for the Forge shared
 * domain glossary.
 *
 * The glossary lives in `.forge/glossary.md` (Open zone) and is consumed by
 * `forge-spec`, `forge-plan`, `forge-learn`, and `forge-decide` to keep
 * naming consistent across multi-session work. This module provides the
 * pure file-format layer only: parsing a markdown document into a
 * `Glossary` structure and rendering that structure back to markdown.
 *
 * The module is intentionally IO-free. All file access is expected to be
 * performed by caller / driver code.
 *
 * File format:
 *
 * ```
 * ---
 * schema_version: 1
 * updated: "2026-05-05"
 * ---
 *
 * # Forge Glossary
 *
 * ## Tier
 * **定义**: Forge 三维路由中的复杂度维度。
 * **别名**: 档位, 复杂度档位
 * **更新**: 2026-05-05
 * **来源**: 初始预置
 *
 * ## Spec
 * **定义**: 需求锁定的产物。
 * **更新**: 2026-05-05
 * ```
 *
 * **Validates: Requirements 1.1, 1.2**
 */
/**
 * A single entry in the glossary.
 *
 * Required fields:
 *   - term:          canonical name, used as the H2 heading
 *   - definition:    concise description (single line recommended)
 *   - last_updated:  ISO 8601 date string (e.g. "2026-05-05")
 *
 * Optional fields:
 *   - aliases:        alternative names that map to the same term
 *   - source_session: filename in `.forge/knowledge/sessions/` that
 *                     introduced the term, when available
 */
export interface GlossaryTerm {
    term: string;
    definition: string;
    aliases?: string[];
    last_updated: string;
    source_session?: string;
}
/**
 * Full glossary document structure.
 *
 *   - schema_version: positive integer used for future migrations
 *   - updated:        ISO 8601 date of the last glossary update
 *   - terms:          ordered list of active `GlossaryTerm` entries
 *   - archivedTerms:  optional ordered list of archived entries shown
 *                      under a trailing `## Archived` section. Terms are
 *                      moved here by {@link archiveTerm} when the learn
 *                      skill decides they are stale.
 *
 * On-disk, the archived section is sentinel-delimited: a literal
 * (case-sensitive) `## Archived` H2 line divides active entries above
 * from archived entries below. The name `Archived` is reserved and must
 * not be used as an ordinary term name.
 */
export interface Glossary {
    schema_version: number;
    updated: string;
    terms: GlossaryTerm[];
    archivedTerms?: GlossaryTerm[];
}
/**
 * Parse a glossary markdown document into a `Glossary` structure.
 *
 * Behaviour:
 *   - Missing / malformed frontmatter yields an empty glossary with
 *     `schema_version=1`, `updated=""`, and `terms=[]`
 *   - Each H2 heading `## <term>` starts a new term entry
 *   - Field lines `**定义**:`, `**别名**:`, `**更新**:`, `**来源**:`
 *     populate the corresponding term fields
 *   - Terms without a `**定义**:` line are considered malformed and are
 *     dropped; no error is thrown (permissive parser)
 *   - Unknown lines inside a term block are ignored
 *
 * This function is pure: same input always yields the same output, and it
 * performs no IO.
 */
export declare function parseGlossary(content: string): Glossary;
/**
 * Render a `Glossary` structure to its canonical markdown representation.
 *
 * The rendered output is consumable by `parseGlossary` such that
 * `parseGlossary(renderGlossary(g))` is structurally equal to `g` when `g`
 * is well-formed (see the property-based test for the equivalence
 * contract).
 *
 * Rules:
 *   - `updated` is quoted in the YAML frontmatter
 *   - `aliases` is omitted when the array is empty or undefined
 *   - `source_session` is omitted when undefined or empty
 *   - Each term is followed by a blank line for readability
 */
export declare function renderGlossary(glossary: Glossary): string;
/**
 * Result of {@link detectConflict}.
 *
 *   - `hasConflict` is `true` only when a conflict is found
 *   - `conflictingTerm` is the existing glossary term that clashes with the
 *     candidate (omitted when there is no conflict)
 *   - `reason` identifies the kind of conflict:
 *       * `same_term_different_definition` — candidate term name matches an
 *         existing term name (case-insensitive) but definitions differ
 *       * `same_alias_different_term` — an alias on the candidate already
 *         belongs to a different term (as that term's name or as one of its
 *         aliases)
 */
export interface ConflictResult {
    hasConflict: boolean;
    conflictingTerm?: GlossaryTerm;
    reason?: "same_term_different_definition" | "same_alias_different_term";
}
/**
 * Look up a term by its canonical name or any of its aliases.
 *
 * Matching is case-insensitive and whitespace-insensitive at the edges. The
 * first matching term (in glossary order) is returned. Returns `null` when
 * no term matches or the query is blank.
 *
 * This function is pure.
 */
export declare function findTerm(glossary: Glossary, query: string): GlossaryTerm | null;
/**
 * Detect whether adding `candidate` to `glossary` would clash with an
 * existing entry.
 *
 * Two kinds of conflict are reported, in priority order:
 *
 *   1. `same_term_different_definition` — the candidate's canonical name
 *      matches an existing term (case-insensitive) but their definitions
 *      differ. Trimmed comparison.
 *   2. `same_alias_different_term` — any of the candidate's aliases already
 *      appears in the glossary under a different term, either as that
 *      term's canonical name or as one of its aliases.
 *
 * When the candidate is a no-op extension of an existing term (same name
 * and same definition), no conflict is reported. This function is pure and
 * never mutates its inputs.
 */
export declare function detectConflict(glossary: Glossary, candidate: GlossaryTerm): ConflictResult;
/**
 * Merge a `candidate` term into a glossary using the requested `strategy`.
 *
 * Strategies:
 *   - `append`    — add `candidate` when no existing term shares its name
 *                   (case-insensitive). No-op when the name already exists.
 *   - `replace`   — replace the existing same-named term with `candidate`.
 *                   Adds `candidate` when the name is not present.
 *   - `add_alias` — merge `candidate.aliases` into the existing same-named
 *                   term's alias list, preserving order and deduplicating
 *                   case-insensitively. No-op when the name is not present
 *                   or when `candidate` has no aliases.
 *
 * All three strategies are idempotent: applying the same merge twice
 * yields the same glossary as applying it once. This function is pure and
 * returns a new glossary; neither argument is mutated.
 */
export declare function mergeTerm(glossary: Glossary, candidate: GlossaryTerm, strategy: "append" | "replace" | "add_alias"): Glossary;
/**
 * Return the subset of terms whose `last_updated` is older than
 * `maxAgeDays` days before `now`.
 *
 * Terms with a malformed or missing `last_updated` are treated as stale
 * (they cannot be proven fresh). The default `maxAgeDays` is 30, matching
 * the glossary maintenance window described in Requirement 1.11.
 *
 * This function is pure. The returned array is a (possibly empty) subset
 * of `glossary.terms` in their original order.
 */
export declare function findStaleterms(glossary: Glossary, now: Date, maxAgeDays?: number): GlossaryTerm[];
/**
 * Move a term from the active glossary into the `## Archived` section.
 *
 * Behaviour:
 *   - When the term is not found in `glossary.terms` (case-insensitive
 *     match on canonical name), the glossary is returned unchanged.
 *   - When the term is found, it is removed from `terms` and appended to
 *     `archivedTerms`. Existing order among the other active terms is
 *     preserved; the archived entry is placed at the end of the archived
 *     list.
 *   - When an archived entry with the same canonical name already
 *     exists, it is replaced by the newly archived term (re-archiving is
 *     idempotent and always uses the most recent definition).
 *
 * Matching is case- and whitespace-insensitive on the canonical term
 * name only; aliases are not considered because archival acts on a
 * specific entry rather than on a concept.
 *
 * This function is pure and returns a new `Glossary`; the input is
 * never mutated.
 *
 * **Validates: Requirements 1.11**
 */
export declare function archiveTerm(glossary: Glossary, termName: string): Glossary;
