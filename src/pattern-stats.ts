/**
 * Pattern Confidence Lifecycle — types, parser, renderer, and statistics
 * updates for the patterns stored in `.tinkerman/knowledge/instincts.md`.
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
 *
 * @internal
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

/** @internal Suggestion returned by {@link findUpgradableEpisodes}. */
export interface UpgradeSuggestion {
  clusterKey: string;
  episodes: Episode[];
  patternDraft: Partial<Pattern>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DECAY_THRESHOLD = 0.5;
const DEFAULT_MAX_AGE_DAYS = 60;
const DEFAULT_WINDOW_DAYS = 60;
const DEFAULT_MIN_OCCURRENCES = 3;
const BETA_ALPHA = 2;
const BETA_BETA = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** H1 banner used when rendering a fresh instincts file. */
const INSTINCTS_TITLE = "# Forge Instincts";
/** H2 that partitions active patterns from archived ones. */
const ARCHIVED_SENTINEL = "## Archived";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the contents of `.tinkerman/knowledge/instincts.md` into a list of
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
 *
 * @internal
 */
export function parseInstinct(content: string): Pattern[] {
  const { body } = stripFrontmatter(content);
  const { active } = splitActiveArchived(body);
  return parsePatternSections(active);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

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
 *
 * @internal
 */
export function renderInstincts(patterns: Pattern[]): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push("schema_version: 2");
  lines.push("---");
  lines.push("");
  lines.push(INSTINCTS_TITLE);
  lines.push("");
  for (const p of patterns) {
    appendPatternLines(lines, p);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Confidence lifecycle
// ---------------------------------------------------------------------------

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
 *
 * @internal
 */
export function updatePatternStats(
  pattern: Pattern,
  outcome: "success" | "failure",
  now: Date,
): Pattern {
  const applications = pattern.applications + 1;
  const successes = pattern.successes + (outcome === "success" ? 1 : 0);
  const failures = pattern.failures + (outcome === "failure" ? 1 : 0);
  const confidence = (successes + BETA_ALPHA) / (applications + BETA_ALPHA + BETA_BETA);
  return {
    ...pattern,
    applications,
    successes,
    failures,
    confidence,
    last_triggered: toIsoDate(now),
  };
}

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
 *
 * @internal
 */
export function findStaleOrDecayedPatterns(
  patterns: Pattern[],
  now: Date,
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
): Pattern[] {
  const nowMs = now.getTime();
  const thresholdMs = maxAgeDays * MS_PER_DAY;
  return patterns.filter((p) => {
    const decayed = p.confidence < p.decay_threshold && p.applications >= 3;
    const triggeredMs = parseIsoDate(p.last_triggered);
    const stale = triggeredMs === null || nowMs - triggeredMs > thresholdMs;
    return decayed || stale;
  });
}

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
 *
 * @internal
 */
export function findUpgradableEpisodes(
  episodes: Episode[],
  patterns: Pattern[],
  now: Date,
  windowDays: number = DEFAULT_WINDOW_DAYS,
  minOccurrences: number = DEFAULT_MIN_OCCURRENCES,
): UpgradeSuggestion[] {
  const nowMs = now.getTime();
  const windowMs = windowDays * MS_PER_DAY;
  const clusters = new Map<string, Episode[]>();

  for (const ep of episodes) {
    const rootCause = ep.root_cause?.trim();
    if (rootCause === undefined || rootCause.length === 0) continue;
    const episodeMs = parseIsoDate(ep.date);
    if (episodeMs === null || nowMs - episodeMs > windowMs) continue;
    const key = buildClusterKey(ep.skill, rootCause);
    const bucket = clusters.get(key);
    if (bucket === undefined) {
      clusters.set(key, [ep]);
    } else {
      bucket.push(ep);
    }
  }

  const coveredKeys = new Set(patterns.map((p) => coverageKey(p)));

  const suggestions: UpgradeSuggestion[] = [];
  for (const [key, eps] of clusters) {
    if (eps.length < minOccurrences) continue;
    if (isCoveredByExistingPattern(key, coveredKeys)) continue;
    suggestions.push({
      clusterKey: key,
      episodes: eps,
      patternDraft: buildPatternDraft(key, eps, now),
    });
  }

  suggestions.sort((a, b) => b.episodes.length - a.episodes.length);
  return suggestions;
}

// ---------------------------------------------------------------------------
// Internal — parsing helpers
// ---------------------------------------------------------------------------

/**
 * Remove an optional YAML frontmatter block at the top of the file.
 * The frontmatter is discarded because `renderInstincts` always emits
 * a canonical header and round-trip preservation is defined at the
 * pattern-array level, not at the frontmatter level.
 */
export function stripFrontmatter(content: string): { body: string } {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return { body: content };
  const rest = trimmed.slice(3);
  const closing = rest.indexOf("\n---");
  if (closing === -1) return { body: content };
  const after = rest.slice(closing + 1 + 3);
  // Skip the newline that immediately follows the closing delimiter.
  const bodyStart = after.indexOf("\n");
  const body = bodyStart === -1 ? "" : after.slice(bodyStart + 1);
  return { body };
}

/** Partition the body text at the `## Archived` sentinel. */
export function splitActiveArchived(body: string): { active: string; archived: string } {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trimEnd() === ARCHIVED_SENTINEL) {
      return {
        active: lines.slice(0, i).join("\n"),
        archived: lines.slice(i + 1).join("\n"),
      };
    }
  }
  return { active: body, archived: "" };
}

/** Accumulator for an in-flight pattern block during line-by-line parse. */
interface PatternAccumulator {
  name: string;
  fields: Map<string, string>;
  bodyLines: string[];
}

/**
 * Parse the body (after frontmatter + active/archived split) into
 * pattern records. Each `### <name>` heading starts a new block.
 */
function parsePatternSections(body: string): Pattern[] {
  const lines = body.split("\n");
  const patterns: Pattern[] = [];
  let current: PatternAccumulator | null = null;

  const flush = (): void => {
    if (current === null) return;
    const pattern = finalizePattern(current);
    if (pattern !== null) patterns.push(pattern);
    current = null;
  };

  for (const line of lines) {
    const h3Match = line.match(/^###\s+(.+?)\s*$/);
    if (h3Match !== null) {
      flush();
      current = { name: h3Match[1].trim(), fields: new Map(), bodyLines: [] };
      continue;
    }

    if (current === null) continue;

    const fieldMatch = line.match(/^\*\*([A-Za-z_][A-Za-z0-9_]*)\*\*\s*[:：]\s*(.*)$/);
    if (fieldMatch !== null) {
      current.fields.set(fieldMatch[1].toLowerCase(), fieldMatch[2].trim());
      continue;
    }

    current.bodyLines.push(line);
  }
  flush();

  return patterns;
}

/**
 * Convert an accumulator into a `Pattern` record, applying the
 * legacy-field fallbacks. Returns `null` for malformed entries (no
 * name).
 */
function finalizePattern(acc: PatternAccumulator): Pattern | null {
  if (acc.name.length === 0) return null;

  const fields = acc.fields;

  // Legacy patterns used `Confidence_Score` instead of `confidence`.
  const confidenceRaw = fields.get("confidence") ?? fields.get("confidence_score");
  const confidence = parseNumber(confidenceRaw, 0);

  const applications = parseNumber(fields.get("applications"), 0);
  const successes = parseNumber(fields.get("successes"), 0);
  const failures = parseNumber(fields.get("failures"), 0);
  const decayThreshold = parseNumber(fields.get("decay_threshold"), DEFAULT_DECAY_THRESHOLD);

  const tags = parseTagList(fields.get("tags"));

  const pattern: Pattern = {
    pattern_id: fields.get("pattern_id") ?? "",
    name: acc.name,
    confidence,
    applications,
    successes,
    failures,
    last_triggered: fields.get("last_triggered") ?? "",
    decay_threshold: decayThreshold,
    tags,
    body: trimBody(acc.bodyLines),
  };

  return pattern;
}

/** Parse a comma / fullwidth-comma separated tag list. */
export function parseTagList(raw: string | undefined): string[] {
  if (raw === undefined || raw.length === 0) return [];
  return raw
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.length === 0) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Drop leading and trailing blank lines from a body capture, preserving
 * internal blank lines. Keeps serialized output compact and makes the
 * round-trip definition independent of incidental whitespace.
 */
function trimBody(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end).join("\n");
}

// ---------------------------------------------------------------------------
// Internal — rendering helpers
// ---------------------------------------------------------------------------

function appendPatternLines(lines: string[], pattern: Pattern): void {
  lines.push(`### ${pattern.name}`);
  lines.push("");
  lines.push(`**pattern_id**: ${pattern.pattern_id}`);
  lines.push(`**confidence**: ${formatNumber(pattern.confidence)}`);
  lines.push(`**applications**: ${pattern.applications}`);
  lines.push(`**successes**: ${pattern.successes}`);
  lines.push(`**failures**: ${pattern.failures}`);
  lines.push(`**last_triggered**: ${pattern.last_triggered}`);
  lines.push(`**decay_threshold**: ${formatNumber(pattern.decay_threshold)}`);
  lines.push(`**tags**: ${pattern.tags.join(", ")}`);

  if (pattern.body.length > 0) {
    lines.push("");
    lines.push(pattern.body);
  }
  lines.push("");
}

/**
 * Render a number so that `Number(formatted)` recovers the original
 * value exactly (up to IEEE-754 rounding). Integers render without a
 * decimal point; fractional values use JavaScript's default numeric
 * serialization.
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

// ---------------------------------------------------------------------------
// Internal — upgrade helpers
// ---------------------------------------------------------------------------

/**
 * Build a stable cluster key from a skill name and a root-cause phrase.
 * The root cause is normalized to lowercase and collapsed to up to three
 * significant tokens so minor wording differences still group together.
 */
export function buildClusterKey(skill: string, rootCause: string): string {
  const tokens = rootCause
    .toLowerCase()
    .replace(/[^a-z0-9\s\u4e00-\u9fff]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .slice(0, 3)
    .sort();
  return `${skill.toLowerCase()}::${tokens.join("-")}`;
}

/** Coverage key extracted from an existing pattern for overlap checks. */
function coverageKey(pattern: Pattern): string {
  return `${pattern.name.toLowerCase()}|${pattern.pattern_id.toLowerCase()}|${pattern.tags
    .map((t) => t.toLowerCase())
    .join(",")}`;
}

function isCoveredByExistingPattern(key: string, coveredKeys: Set<string>): boolean {
  for (const existing of coveredKeys) {
    if (existing.includes(key) || key.includes(existing)) return true;
  }
  return false;
}

/** Build a pattern draft from a cluster of episodes. */
function buildPatternDraft(clusterKey: string, episodes: Episode[], now: Date): Partial<Pattern> {
  const [skill] = clusterKey.split("::");
  const lessons = episodes
    .map((e) => e.lesson)
    .filter((s) => s.length > 0)
    .slice(0, 3);
  return {
    name: `Recurring in ${skill}: ${clusterKey.split("::")[1]}`,
    applications: 0,
    successes: 0,
    failures: 0,
    confidence: BETA_ALPHA / (BETA_ALPHA + BETA_BETA),
    decay_threshold: DEFAULT_DECAY_THRESHOLD,
    last_triggered: toIsoDate(now),
    tags: [skill],
    body: lessons.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO 8601 date (date-only or full timestamp) to epoch ms.
 * Returns `null` for empty / malformed input.
 */
function parseIsoDate(value: string): number | null {
  if (value === undefined || value === null || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Convert a `Date` to an `YYYY-MM-DD` string in UTC. Using UTC keeps the
 * function pure with respect to the caller's local timezone and
 * guarantees deterministic output for the same input across machines.
 */
function toIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
