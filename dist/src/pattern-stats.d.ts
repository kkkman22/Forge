/**
 * Pattern Confidence Lifecycle — types, parser, renderer, and statistics
 * updates for the patterns stored in `.forge/knowledge/instincts.md`.
 *
 * Each pattern carries a Beta-distribution-backed confidence score so the
 * learn skill can surface decayed (low confidence, enough samples) and
 * stale (unused for a long time) patterns, as well as promote repeatedly
 * observed episodes into new patterns.
 *
 * The module is IO-free. All functions are pure; driver code handles
 * file reads and writes.
 *
 * Frontmatter layout per pattern (v2):
 *
 * ```
 * ### <pattern name>
 *
 * **pattern_id**: pat-YYYY-MM-DD-NNN
 * **confidence**: 0.82
 * **applications**: 11
 * **successes**: 9
 * **failures**: 2
 * **last_triggered**: 2026-05-05
 * **decay_threshold**: 0.5
 * **tags**: regex, testing, bug-prevention
 *
 * <body prose...>
 * ```
 *
 * Legacy format uses `**Confidence_Score**: 0.85` / `**Tags**: ...` only.
 * The parser accepts both; the renderer always emits the full v2 block.
 *
 * **Validates: Requirements 7.5, 7.6, 7.7, 7.8, 7.11, 7.13, 7.14**
 */
import type { Episode } from "./episode.js";
/**
 * A single instinct pattern with full confidence-lifecycle metadata.
 *
 *   - `pattern_id`:       stable id of the form `pat-YYYY-MM-DD-NNN`.
 *                         Empty string for legacy patterns whose id has
 *                         not yet been assigned.
 *   - `name`:             human-readable heading (the `### ...` line).
 *   - `confidence`:       Beta-mean estimate in [0, 1].
 *   - `applications`:     total number of times this pattern was
 *                         applied (successes + failures by construction).
 *   - `successes`:        count of successful applications.
 *   - `failures`:         count of failed applications.
 *   - `last_triggered`:   ISO 8601 date of the most recent match. Empty
 *                         string when never triggered.
 *   - `decay_threshold`:  confidence below this value with enough
 *                         applications marks the pattern as decayed.
 *                         Default 0.5.
 *   - `tags`:             optional tags for searching / filtering.
 *   - `body`:             prose description.
 */
export interface Pattern {
    pattern_id: string;
    name: string;
    confidence: number;
    applications: number;
    successes: number;
    failures: number;
    last_triggered: string;
    decay_threshold: number;
    tags: string[];
    body: string;
}
/** Suggestion returned by {@link findUpgradableEpisodes}. */
export interface UpgradeSuggestion {
    clusterKey: string;
    episodes: Episode[];
    patternDraft: Partial<Pattern>;
}
/**
 * Parse the contents of `.forge/knowledge/instincts.md` into a list of
 * patterns.
 *
 * Accepts both:
 *   - Legacy format: H3 name with `**Confidence_Score**` / `**Tags**` lines.
 *   - v2 format: H3 name with `pattern_id`, `confidence`, `applications`,
 *     `successes`, `failures`, `last_triggered`, `decay_threshold`, `tags`.
 *
 * Missing numeric fields default to 0; missing `decay_threshold` defaults
 * to 0.5. Malformed blocks are silently skipped (no throw) so one bad
 * entry cannot break the whole file load.
 *
 * The parser is line-based and tolerates the H1 banner, the optional
 * frontmatter block, and an optional `## ` subsection prior to the H3
 * pattern headings.
 */
export declare function parseInstinct(content: string): Pattern[];
/**
 * Render a list of patterns back to the canonical markdown form.
 *
 * The rendered output is the exact shape consumed by `parseInstinct`
 * so the two form a fixed-point pair:
 *   `parseInstinct(renderInstincts(ps))` ≡ `ps`
 *
 * The top-level `schema_version` / `updated` frontmatter is emitted so
 * future migrations have a hook. Patterns are printed under a single
 * `## Patterns` section; future archived entries live after `## Archived`.
 */
export declare function renderInstincts(patterns: Pattern[]): string;
/**
 * Update the pattern's counters and Beta-mean confidence for a single
 * outcome observation.
 *
 *   applications ← applications + 1
 *   successes    ← successes    + (outcome === "success" ? 1 : 0)
 *   failures     ← failures     + (outcome === "failure" ? 1 : 0)
 *   confidence   ← (successes + α) / (applications + α + β), α=β=2
 *
 * The Beta(α=2, β=2) prior keeps the estimate bounded in (0, 1) even
 * with very few samples, so a single observation cannot swing the score
 * to 0 or 1. The function is pure and returns a new pattern.
 *
 * **Validates: Requirements 7.6, 7.7, 7.13**
 */
export declare function updatePatternStats(pattern: Pattern, outcome: "success" | "failure", now: Date): Pattern;
/**
 * Return the subset of patterns that are either decayed or stale.
 *
 *   - Decayed: `confidence < decay_threshold` AND `applications >= 3`
 *     (enough samples to trust the low score).
 *   - Stale:   `last_triggered` is missing/malformed, or its age exceeds
 *     `maxAgeDays` (default 60).
 *
 * The returned array is a subset of the input in original order, which
 * is the invariant the property test exercises. Pure function.
 *
 * **Validates: Requirements 7.8, 7.13**
 */
export declare function findStaleOrDecayedPatterns(patterns: Pattern[], now: Date, maxAgeDays?: number): Pattern[];
/**
 * Find clusters of recent episodes that recur often enough to warrant
 * a new pattern proposal.
 *
 *   - Only episodes within `windowDays` of `now` are considered.
 *   - Episodes are keyed on `skill` + a normalized root-cause phrase;
 *     episodes missing `root_cause` are skipped because without a
 *     recurring cause signal there is no pattern to extract.
 *   - Clusters with `count >= minOccurrences` and whose key is not
 *     already covered by an existing pattern's `pattern_id` are
 *     returned as upgrade suggestions, each with a partial pattern
 *     draft the caller can fill in and confirm.
 *
 * Pattern coverage is checked by case-insensitive substring match of
 * either the cluster key or the skill name against existing
 * `pattern_id` / `body` / tag fields. This is intentionally a
 * lightweight filter — a stronger semantic equivalence check belongs in
 * the human confirmation step.
 *
 * Pure function. The returned clusters are ordered by descending
 * occurrence count so the caller surfaces the strongest signals first.
 *
 * **Validates: Requirements 7.11**
 */
export declare function findUpgradableEpisodes(episodes: Episode[], patterns: Pattern[], now: Date, windowDays?: number, minOccurrences?: number): UpgradeSuggestion[];
