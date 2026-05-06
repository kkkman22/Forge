/**
 * Episode data model — structured representation of a single learning
 * session recorded under `.forge/knowledge/sessions/<date>-<topic>.md`.
 *
 * An episode captures the essential fields from a forge session:
 *
 *   - `schema_version`:   1 (legacy) or 2 (structured)
 *   - `id`:               `ep-YYYY-MM-DD-NNN` (daily sequence)
 *   - `date`:             ISO 8601 date
 *   - `skill`:            triggering skill name (e.g. `forge-review`)
 *   - `tier`:             light / standard / full
 *   - `situation`:        one-line description
 *   - `root_cause`:       optional, diagnosed cause
 *   - `solution`:         optional, applied fix
 *   - `lesson`:           reusable takeaway
 *   - `outcome`:          success / partial / failure
 *   - `user_rating`:      optional 1-10 score
 *   - `related_pattern`:  optional pattern id pointer
 *   - `related_skills`:   optional list of skills to consider updating
 *   - `body`:             prose after the frontmatter (preserved)
 *
 * Schema versioning:
 *   - Frontmatter without `schema_version` is treated as v1 (legacy
 *     narrative format). Missing structured fields are filled with
 *     empty/neutral defaults so legacy records still round-trip cleanly.
 *   - `schema_version: 2` files carry the full structured frontmatter.
 *
 * The module is IO-free. All file access lives in driver/integration
 * code; this module only knows how to turn bytes into an `Episode` and
 * back.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.12**
 */
/** Episode outcome classification. */
export type EpisodeOutcome = "success" | "partial" | "failure";
/** Episode tier — mirrors the router complexity dimension. */
export type EpisodeTier = "light" | "standard" | "full";
/**
 * A single session episode. See the module header for field semantics.
 *
 * Optional fields are omitted from the serialized frontmatter when they
 * are undefined or empty so that round-trips through an empty-optional
 * path do not re-introduce spurious keys.
 */
export interface Episode {
    schema_version: 1 | 2;
    id: string;
    date: string;
    skill: string;
    tier: EpisodeTier;
    situation: string;
    root_cause?: string;
    solution?: string;
    lesson: string;
    outcome: EpisodeOutcome;
    user_rating?: number;
    related_pattern?: string;
    related_skills?: string[];
    body: string;
}
/**
 * Parse a markdown document into an `Episode`.
 *
 * Returns `null` when:
 *   - the document has no frontmatter block, or
 *   - a required field is missing (only enforced for v2 / when
 *     `schema_version` is declared), or
 *   - `tier` is not in {light, standard, full}, or
 *   - `outcome` is not in {success, partial, failure}, or
 *   - `user_rating` is present but not a finite number.
 *
 * Legacy (v1) inputs are handled by treating the absence of a
 * `schema_version` field as schema 1 and filling missing structured
 * fields with neutral defaults (empty strings / `"standard"` tier /
 * `"success"` outcome). This keeps legacy narrative sessions readable
 * without forcing a backfill.
 *
 * The function is pure: same input always yields the same output.
 */
export declare function parseEpisode(content: string): Episode | null;
/**
 * Render an `Episode` back to its canonical markdown representation.
 *
 * Rules:
 *   - Frontmatter always opens with `schema_version` then `id`, `date`,
 *     `skill`, `tier`, `situation`, `outcome`, `lesson`. Deterministic
 *     key ordering keeps diffs quiet.
 *   - Strings are double-quoted when they contain characters that would
 *     otherwise confuse the downstream parser (`:`, leading `-`, quotes,
 *     `#`). Plain tokens stay unquoted for readability.
 *   - Optional fields are omitted when undefined / empty.
 *   - `related_skills` is emitted as a YAML block list when non-empty.
 *   - The body is preserved verbatim after a blank line following the
 *     closing frontmatter delimiter, so v1 narrative content survives
 *     unchanged.
 */
export declare function renderEpisode(episode: Episode): string;
/**
 * Produce an episode id of the form `ep-YYYY-MM-DD-NNN`.
 *
 * Pure and idempotent: calling with the same `(date, sequenceInDay)`
 * pair always returns the same string. `sequenceInDay` is clamped to
 * non-negative integers and zero-padded to three digits. Callers are
 * expected to supply an ISO date string; this function does not
 * validate the date format, leaving that to the caller / scheduler.
 */
export declare function generateEpisodeId(date: string, sequenceInDay: number): string;
