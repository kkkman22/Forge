/**
 * Glossary term extraction — pure, IO-free heuristics that surface
 * candidate terms for potential inclusion in the Forge shared glossary.
 *
 * The extractor runs over free-form text (spec drafts, plan bodies,
 * session notes) and returns a list of `TermCandidate` values that
 * downstream skills can filter, rank, and present to the user before
 * merging into `.forge/glossary.md`.
 *
 * Heuristics are intentionally simple and language-agnostic:
 *
 *   1. TitleCase multi-word noun phrases (e.g. "Dynamic Dispatch",
 *      "Event Sourcing") — two or more space-separated words where each
 *      word starts with an uppercase letter followed by lowercase.
 *   2. PascalCase / CamelCase technical terms (e.g. "EventSourcing",
 *      "DynamicDispatch") — a single word with at least one internal
 *      uppercase letter after a lowercase run.
 *   3. Contiguous Chinese character sequences of 2+ characters (CJK
 *      unified ideographs U+4E00..U+9FFF).
 *
 * The module is pure: same input → same output, no IO, no RNG. See
 * `test/glossary-extractor.property.test.ts` for the behavioural
 * contract.
 *
 * **Validates: Requirements 1.2, 1.6, 1.8, 1.9**
 */
/**
 * A single candidate term identified by {@link extractCandidates}.
 *
 *   - term:       the surface form as it first appeared in the text
 *   - context:    a trimmed snippet of surrounding text (≈ 40 chars) useful
 *                 for the user to judge meaning at a glance
 *   - frequency:  number of occurrences in the source text (matches of the
 *                 same surface form collapse into one candidate whose
 *                 frequency is the count)
 */
export interface TermCandidate {
    term: string;
    context: string;
    frequency: number;
}
/**
 * Filter and ranking rules applied by {@link filterCandidates}.
 *
 *   - minFrequency:             minimum occurrence count; candidates below
 *                               this threshold are dropped
 *   - minLength:                minimum term length (characters); shorter
 *                               candidates are dropped
 *   - excludePatterns:          regex patterns; any candidate whose term
 *                               matches *any* pattern is dropped
 *   - maxCandidatesPerSession:  final cap on the result list, applied
 *                               after sorting by frequency
 */
export interface ExtractionRules {
    minFrequency: number;
    minLength: number;
    excludePatterns: RegExp[];
    maxCandidatesPerSession: number;
}
/**
 * Default extraction rules tuned for Forge session transcripts and spec
 * drafts. Callers are encouraged to clone and tweak rather than mutate.
 *
 * Patterns excluded by default:
 *   - camelCase variables / identifiers starting with a lowercase letter
 *   - private function / member names starting with an underscore
 */
export declare const DEFAULT_EXTRACTION_RULES: ExtractionRules;
/**
 * Identify candidate terms in `text`, skipping anything already present in
 * `existingTerms` (case- and whitespace-insensitive match).
 *
 * Behaviour:
 *   - Empty input returns `[]`.
 *   - Duplicate surface forms collapse; the first occurrence supplies the
 *     canonical casing and context snippet, later occurrences only bump
 *     `frequency`.
 *   - Overlapping matches across patterns are deduplicated by
 *     case-insensitive surface form (e.g. "EventSourcing" and
 *     "eventsourcing" collapse).
 *   - Terms appearing in `existingTerms` (compared case-insensitively
 *     after trimming) are skipped entirely — even if the surface form is
 *     a new casing.
 *   - The function never throws: unusual characters, RTL text, control
 *     bytes, and huge inputs all yield a (possibly empty) array.
 *
 * The output is not sorted and not capped; use {@link filterCandidates}
 * to shape it into a ranked shortlist.
 *
 * This function is pure.
 */
export declare function extractCandidates(text: string, existingTerms: string[]): TermCandidate[];
/**
 * Apply {@link ExtractionRules} to a list of candidates and return the
 * shortlist that should be surfaced to the user.
 *
 * Pipeline (order matters for monotonicity reasoning):
 *
 *   1. Dedupe — collapse case-insensitive duplicates, taking the higher
 *      `frequency` and preserving the first-seen surface form / context.
 *   2. `minLength` — drop shorter terms.
 *   3. `excludePatterns` — drop terms matching any excluded pattern.
 *   4. `minFrequency` — drop terms below the frequency threshold.
 *   5. Sort by `frequency` descending; ties broken by term ascending (so
 *      the result is deterministic and stable).
 *   6. Cap at `maxCandidatesPerSession`.
 *
 * Monotonicity: tightening any filter axis (`minLength`,
 * `excludePatterns`, `minFrequency`) while keeping
 * `maxCandidatesPerSession` large enough to be non-binding yields a
 * subset of the looser rule's result. See the property test for the
 * formal statement.
 *
 * This function is pure and does not mutate its inputs.
 */
export declare function filterCandidates(candidates: TermCandidate[], rules: ExtractionRules): TermCandidate[];
