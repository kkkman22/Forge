/**
 * Episode data model — structured representation of a single learning
 * session recorded under `.tinkerman/knowledge/sessions/<date>-<topic>.md`.
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

import {
  extractListField,
  extractNumericField,
  extractStringField,
  parseFrontmatter,
} from "./frontmatter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @internal Episode outcome classification. */
export type EpisodeOutcome = "success" | "partial" | "failure";

/** @internal Episode tier — mirrors the router complexity dimension. */
export type EpisodeTier = "light" | "standard" | "full";

/**
 * A single session episode. See the module header for field semantics.
 *
 * Optional fields are omitted from the serialized frontmatter when they
 * are undefined or empty so that round-trips through an empty-optional
 * path do not re-introduce spurious keys.
 *
 * @internal
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Required frontmatter keys for a well-formed v2 episode. */
const REQUIRED_FIELDS = ["id", "date", "skill", "tier", "situation", "lesson", "outcome"] as const;

const VALID_TIERS: ReadonlySet<EpisodeTier> = new Set(["light", "standard", "full"]);
const VALID_OUTCOMES: ReadonlySet<EpisodeOutcome> = new Set(["success", "partial", "failure"]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
 *
 * @internal
 */
export function parseEpisode(content: string): Episode | null {
  const fm = parseFrontmatter(content);
  if (fm === null) return null;

  const declaredVersion = extractNumericField(fm.raw, "schema_version");
  const schemaVersion: 1 | 2 = declaredVersion === 2 ? 2 : 1;

  // For v2 records we enforce all required fields. For legacy v1 records
  // we tolerate missing fields and fall back to neutral defaults so the
  // ecosystem does not need to rewrite historical sessions.
  const id = extractStringField(fm.raw, "id");
  const date = extractStringField(fm.raw, "date");
  const skill = extractStringField(fm.raw, "skill");
  const tierRaw = extractStringField(fm.raw, "tier");
  const situation = extractStringField(fm.raw, "situation");
  const lesson = extractStringField(fm.raw, "lesson");
  const outcomeRaw = extractStringField(fm.raw, "outcome");

  if (schemaVersion === 2) {
    const values: Record<(typeof REQUIRED_FIELDS)[number], string | null> = {
      id,
      date,
      skill,
      tier: tierRaw,
      situation,
      lesson,
      outcome: outcomeRaw,
    };
    for (const key of REQUIRED_FIELDS) {
      const value = values[key];
      if (value === null || value.length === 0) return null;
    }
  }

  const tier: EpisodeTier =
    tierRaw !== null && VALID_TIERS.has(tierRaw as EpisodeTier)
      ? (tierRaw as EpisodeTier)
      : "standard";
  if (schemaVersion === 2 && !VALID_TIERS.has(tier)) return null;

  const outcome: EpisodeOutcome =
    outcomeRaw !== null && VALID_OUTCOMES.has(outcomeRaw as EpisodeOutcome)
      ? (outcomeRaw as EpisodeOutcome)
      : "success";
  if (schemaVersion === 2 && !VALID_OUTCOMES.has(outcome)) return null;

  const episode: Episode = {
    schema_version: schemaVersion,
    id: id ?? "",
    date: date ?? "",
    skill: skill ?? "",
    tier,
    situation: situation ?? "",
    lesson: lesson ?? "",
    outcome,
    body: fm.body,
  };

  const rootCause = extractStringField(fm.raw, "root_cause");
  if (rootCause !== null && rootCause.length > 0) episode.root_cause = rootCause;

  const solution = extractStringField(fm.raw, "solution");
  if (solution !== null && solution.length > 0) episode.solution = solution;

  const userRating = extractNumericField(fm.raw, "user_rating");
  if (userRating !== null) {
    if (!Number.isFinite(userRating)) return null;
    episode.user_rating = userRating;
  }

  const relatedPattern = extractStringField(fm.raw, "related_pattern");
  if (relatedPattern !== null && relatedPattern.length > 0) {
    episode.related_pattern = relatedPattern;
  }

  const relatedSkills = extractListField(fm.raw, "related_skills");
  if (relatedSkills.length > 0) episode.related_skills = relatedSkills;

  return episode;
}

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
 *
 * @internal
 */
export function renderEpisode(episode: Episode): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`schema_version: ${episode.schema_version}`);
  lines.push(`id: ${quoteIfNeeded(episode.id)}`);
  lines.push(`date: ${quoteIfNeeded(episode.date)}`);
  lines.push(`skill: ${quoteIfNeeded(episode.skill)}`);
  lines.push(`tier: ${episode.tier}`);
  lines.push(`situation: ${quoteIfNeeded(episode.situation)}`);

  if (episode.root_cause !== undefined && episode.root_cause.length > 0) {
    lines.push(`root_cause: ${quoteIfNeeded(episode.root_cause)}`);
  }
  if (episode.solution !== undefined && episode.solution.length > 0) {
    lines.push(`solution: ${quoteIfNeeded(episode.solution)}`);
  }

  lines.push(`lesson: ${quoteIfNeeded(episode.lesson)}`);
  lines.push(`outcome: ${episode.outcome}`);

  if (episode.user_rating !== undefined) {
    lines.push(`user_rating: ${episode.user_rating}`);
  }
  if (episode.related_pattern !== undefined && episode.related_pattern.length > 0) {
    lines.push(`related_pattern: ${quoteIfNeeded(episode.related_pattern)}`);
  }
  if (episode.related_skills !== undefined && episode.related_skills.length > 0) {
    lines.push("related_skills:");
    for (const s of episode.related_skills) {
      lines.push(`  - ${quoteIfNeeded(s)}`);
    }
  }

  lines.push("---");
  lines.push(episode.body);

  return lines.join("\n");
}

/**
 * Produce an episode id of the form `ep-YYYY-MM-DD-NNN`.
 *
 * Pure and idempotent: calling with the same `(date, sequenceInDay)`
 * pair always returns the same string. `sequenceInDay` is clamped to
 * non-negative integers and zero-padded to three digits. Callers are
 * expected to supply an ISO date string; this function does not
 * validate the date format, leaving that to the caller / scheduler.
 *
 * @internal
 */
export function generateEpisodeId(date: string, sequenceInDay: number): string {
  const seq = Math.max(0, Math.trunc(sequenceInDay));
  return `ep-${date}-${String(seq).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Render a YAML scalar that round-trips cleanly through the lightweight
 * frontmatter helpers.
 *
 * The helpers in `frontmatter.ts` strip optional surrounding double
 * quotes, forbid literal `"` in captured values, and trim whitespace on
 * extraction. Consequently the only representable values are those
 * without embedded `"`, CR, or LF; surrounding whitespace is never
 * preserved by the parser and callers must supply pre-trimmed values.
 *
 * Empty strings are emitted as `""` so the field remains visibly
 * present in the rendered output.
 */
function quoteIfNeeded(value: string): string {
  if (value.length === 0) return '""';
  return value;
}
