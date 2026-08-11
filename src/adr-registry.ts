/**
 * ADR Registry — types, frontmatter parsing and registry helpers for
 * Architecture Decision Records.
 *
 * Provides:
 *   - `AdrFrontmatter` interface: the contract of ADR frontmatter fields
 *   - `AdrEntry` extended type adding `filePath` for loaded records
 *   - `parseAdrFrontmatter`: pure function that parses a markdown document's
 *     frontmatter into an `AdrFrontmatter`, or returns null when missing or
 *     malformed
 *   - `loadAllAdrs`: pure function that parses a batch of ADR files via an
 *     injected `readFile` callback, skipping entries that fail to parse
 *   - `nextAdrId`: pure function that yields the next canonical `ADR-NNNN`
 *     id given a list of existing entries
 *   - `findRelatedAdrs`: pure function that scores ADRs by Jaccard similarity
 *     between the task description and each ADR title, returning the top-N
 *     matches
 *
 * This module is intentionally IO-free. All file access is injected by the
 * caller via callbacks, so the module can be exercised with in-memory
 * fixtures in tests.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.7**
 */

import { extractListField, extractStringField, parseFrontmatter } from "./frontmatter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Allowed lifecycle states for an ADR. */
export type AdrStatus = "proposed" | "accepted" | "superseded" | "deprecated";

/**
 * Frontmatter contract for an ADR document.
 *
 * Required:
 *   - id:        canonical identifier, e.g. "ADR-0042"
 *   - title:     human-readable title
 *   - status:    lifecycle status (see `AdrStatus`)
 *   - date:      ISO 8601 date string
 *   - deciders:  list of decider identifiers (handles, emails, names)
 *
 * Optional:
 *   - related_adrs: other ADR ids referenced by this decision
 *   - supersedes:   id of an ADR that this one replaces
 *   - superseded_by: id of an ADR that replaces this one
 *
 * ADR three-question gate fields (Requirements 2.3, 2.7 — optional
 * extensions populated by `/tinkerman decide` when verdict is
 * `WRITE_ADR`). These fields are additive and never conflict with the
 * `engineering-governance-hardening` spec's ADR frontmatter schema —
 * they occupy their own key space:
 *   - reversibility:           "hard" when reversal cost is meaningful
 *   - surprising:              true when a future reader would ask "why?"
 *   - trade_off_alternatives:  the alternatives weighed against the
 *                              chosen decision
 */
export interface AdrFrontmatter {
  id: string;
  title: string;
  status: AdrStatus;
  date: string;
  deciders: string[];
  related_adrs?: string[];
  supersedes?: string;
  superseded_by?: string;
  reversibility?: "hard" | "soft";
  surprising?: boolean;
  trade_off_alternatives?: string[];
}

/** Loaded ADR record with the source file path attached. */
export interface AdrEntry extends AdrFrontmatter {
  filePath: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ADR id format: "ADR-" followed by 4 digits, zero-padded. */
const ADR_ID_PATTERN = /^ADR-\d{4}$/;

/** The set of allowed ADR status values, used for runtime validation. */
const ALLOWED_STATUSES: ReadonlySet<AdrStatus> = new Set<AdrStatus>([
  "proposed",
  "accepted",
  "superseded",
  "deprecated",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse an inline YAML array literal like `["a", "b"]` or `[]`.
 *
 * Returns the parsed items or null when the value is not an inline array.
 * Items may be quoted (single or double) or bare; surrounding whitespace
 * is trimmed.
 */
export function parseInlineArray(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") {
    return [];
  }
  // Split on commas that are not inside quotes.
  const items: string[] = [];
  let buffer = "";
  let quote: '"' | "'" | null = null;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        buffer += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ",") {
      items.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += ch;
  }
  if (buffer.trim() !== "" || items.length > 0) {
    items.push(buffer.trim());
  }
  return items.filter((item) => item !== "");
}

/**
 * Extract a list-valued field that may be written in either inline form
 * (`field: ["a", "b"]`) or indented list form.
 *
 * Returns null when the field is absent entirely. Returns an empty array
 * for an explicitly empty list.
 */
function extractListOrInline(frontmatter: string, fieldName: string): string[] | null {
  // First, try inline form by reading the entire rest of the line. We cannot
  // rely on `extractStringField` here because it stops at quote characters,
  // which would truncate `["a", "b"]` style values.
  const inlinePattern = new RegExp(`^${escapeFieldName(fieldName)}:[ \\t]*(.*)$`, "m");
  const inlineMatch = frontmatter.match(inlinePattern);
  if (inlineMatch) {
    const rest = inlineMatch[1].trim();
    if (rest.startsWith("[")) {
      return parseInlineArray(rest);
    }
    if (rest !== "") {
      // Field has a scalar value on the same line — not a valid list.
      return null;
    }
    // rest === "" → header-only form, fall through to indented-list parsing.
    const items = extractListField(frontmatter, fieldName);
    // Strip surrounding quotes from each item so that quoted YAML emissions
    // like `- "@a"` round-trip to `@a`. We accept either matched single or
    // double quotes; mismatched or partial quotes are preserved verbatim.
    return items.map(stripSurroundingQuotes);
  }
  return null;
}

/**
 * Strip a matched pair of surrounding single or double quotes from a
 * trimmed string. Leaves the value unchanged when the quotes do not match
 * or when the string is too short.
 */
export function stripSurroundingQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    return value.slice(1, -1);
  }
  return value;
}

/** Escape regex special characters for safe use as a literal field name. */
export function escapeFieldName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize an optional string field:
 *   - null or empty string → undefined
 *   - otherwise → trimmed value
 */
export function optionalString(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse the frontmatter of an ADR document.
 *
 * Returns a fully-populated `AdrFrontmatter` when the document has a
 * well-formed frontmatter block with all required fields and an allowed
 * status. Returns `null` when:
 *   - the document has no frontmatter block, or
 *   - any required field is missing or empty, or
 *   - `id` does not match the `ADR-NNNN` format, or
 *   - `status` is not one of the allowed values.
 *
 * This function performs no IO and has no side effects.
 */
export function parseAdrFrontmatter(content: string): AdrFrontmatter | null {
  const fm = parseFrontmatter(content);
  if (fm === null) {
    return null;
  }

  const id = optionalString(extractStringField(fm.raw, "id"));
  const title = optionalString(extractStringField(fm.raw, "title"));
  const status = optionalString(extractStringField(fm.raw, "status"));
  const date = optionalString(extractStringField(fm.raw, "date"));
  const deciders = extractListOrInline(fm.raw, "deciders");

  // Required fields must all be present.
  if (id === undefined || title === undefined || status === undefined || date === undefined) {
    return null;
  }
  if (deciders === null || deciders.length === 0) {
    return null;
  }

  // id must match the canonical ADR-NNNN pattern.
  if (!ADR_ID_PATTERN.test(id)) {
    return null;
  }

  // status must be an allowed enum value.
  if (!ALLOWED_STATUSES.has(status as AdrStatus)) {
    return null;
  }

  const result: AdrFrontmatter = {
    id,
    title,
    status: status as AdrStatus,
    date,
    deciders,
  };

  const related = extractListOrInline(fm.raw, "related_adrs");
  if (related !== null) {
    result.related_adrs = related;
  }

  const supersedes = optionalString(extractStringField(fm.raw, "supersedes"));
  if (supersedes !== undefined) {
    result.supersedes = supersedes;
  }

  const supersededBy = optionalString(extractStringField(fm.raw, "superseded_by"));
  if (supersededBy !== undefined) {
    result.superseded_by = supersededBy;
  }

  // ADR three-question gate fields (Requirements 2.3, 2.7).
  // These are optional extensions written by `/tinkerman decide` when
  // verdict is WRITE_ADR; they never conflict with the governance
  // spec's ADR fields.
  const reversibility = optionalString(extractStringField(fm.raw, "reversibility"));
  if (reversibility === "hard" || reversibility === "soft") {
    result.reversibility = reversibility;
  }

  const surprisingRaw = optionalString(extractStringField(fm.raw, "surprising"));
  if (surprisingRaw === "true") {
    result.surprising = true;
  } else if (surprisingRaw === "false") {
    result.surprising = false;
  }

  const tradeOffAlternatives = extractListOrInline(fm.raw, "trade_off_alternatives");
  if (tradeOffAlternatives !== null) {
    result.trade_off_alternatives = tradeOffAlternatives;
  }

  return result;
}

// ---------------------------------------------------------------------------
// ADR loading
// ---------------------------------------------------------------------------

/**
 * Load and parse a batch of ADR files.
 *
 * IO is fully injected via the `readFile` callback so the function remains
 * pure. Entries that cannot be read (callback returns `undefined`) or whose
 * content does not produce a valid `AdrFrontmatter` are silently skipped —
 * `loadAllAdrs` never throws on malformed input. This keeps the caller's
 * bootstrap path resilient to partially corrupted decisions directories.
 *
 * The returned entries preserve the order of `entries` (callers may sort as
 * they see fit).
 */
export function loadAllAdrs(
  entries: string[],
  readFile: (path: string) => string | undefined,
): AdrEntry[] {
  const loaded: AdrEntry[] = [];
  for (const path of entries) {
    const content = readFile(path);
    if (content === undefined) {
      continue;
    }
    const parsed = parseAdrFrontmatter(content);
    if (parsed === null) {
      continue;
    }
    loaded.push({ ...parsed, filePath: path });
  }
  return loaded;
}

// ---------------------------------------------------------------------------
// ADR id generation
// ---------------------------------------------------------------------------

/**
 * Compute the next canonical ADR id.
 *
 * Rules:
 *   - Given an empty list, returns `"ADR-0001"`.
 *   - Otherwise, takes the maximum numeric suffix across all entries whose
 *     id matches the canonical `ADR-NNNN` pattern, increments it by one, and
 *     returns the zero-padded 4-digit form.
 *   - Entries with malformed ids are ignored when computing the maximum
 *     (callers who need strict validation should use `parseAdrFrontmatter`
 *     upstream). If no entry has a valid id, falls back to `"ADR-0001"`.
 *
 * The function is pure and deterministic in its input.
 */
export function nextAdrId(existing: AdrEntry[]): string {
  let max = 0;
  for (const entry of existing) {
    const match = entry.id.match(/^ADR-(\d{4})$/);
    if (match === null) {
      continue;
    }
    const n = Number.parseInt(match[1], 10);
    if (Number.isFinite(n) && n > max) {
      max = n;
    }
  }
  const next = max + 1;
  return `ADR-${String(next).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Related ADR discovery
// ---------------------------------------------------------------------------

/**
 * Tokenize a string for Jaccard comparison.
 *
 * Lowercases, splits on non-word characters, drops a small set of common
 * English / Chinese-project stopwords, and discards tokens shorter than 2
 * characters. The result is a set of distinct tokens.
 *
 * Kept intentionally minimal — for Forge's use case (~dozens of ADRs, short
 * titles), more elaborate tokenization is not worth the complexity.
 */
export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

/** Conservative stopword list for title/description similarity scoring. */
const STOPWORDS: ReadonlySet<string> = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "for",
  "to",
  "in",
  "on",
  "at",
  "by",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "as",
  "that",
  "this",
  "these",
  "those",
  "it",
  "its",
  "from",
]);

/**
 * Compute Jaccard similarity between two token sets.
 *
 * Defined as `|A ∩ B| / |A ∪ B|`. Returns 0 when the union is empty (i.e.
 * both inputs are empty after tokenization), avoiding division by zero.
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find ADRs most related to a task description.
 *
 * Scores each ADR by Jaccard similarity between the tokenized task
 * description and the tokenized ADR title. Returns up to `limit` ADRs
 * ordered by:
 *   1. similarity descending
 *   2. id descending (newer first) to break ties — newer decisions are more
 *      likely to reflect current context
 *
 * ADRs with zero similarity are excluded so the caller never surfaces
 * unrelated results. If `limit <= 0` or the description produces no tokens,
 * returns an empty list.
 */
export function findRelatedAdrs(
  taskDescription: string,
  adrs: AdrEntry[],
  limit: number,
): AdrEntry[] {
  if (limit <= 0) {
    return [];
  }
  const queryTokens = tokenize(taskDescription);
  if (queryTokens.size === 0) {
    return [];
  }

  const scored: Array<{ entry: AdrEntry; score: number }> = [];
  for (const entry of adrs) {
    const titleTokens = tokenize(entry.title);
    const score = jaccard(queryTokens, titleTokens);
    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Tie-break: newer (larger id) first. String compare works because ids
    // are fixed-width zero-padded.
    if (a.entry.id < b.entry.id) return 1;
    if (a.entry.id > b.entry.id) return -1;
    return 0;
  });

  return scored.slice(0, limit).map((s) => s.entry);
}

// ---------------------------------------------------------------------------
// Index rendering
// ---------------------------------------------------------------------------

/** Header comment prepended to every generated `adr-index.md`. */
const ADR_INDEX_HEADER = "<!-- Generated by src/adr-registry.ts — do not edit manually -->";

/** Markdown table header and separator rows. */
const ADR_INDEX_TABLE_HEAD = "| ID | Title | Status | Date | File |";
const ADR_INDEX_TABLE_SEP = "| --- | --- | --- | --- | --- |";

/**
 * Escape a cell value for safe insertion into a Markdown table.
 *
 * Replaces pipe characters (which would break the column layout) with their
 * escaped form, and collapses any newlines to a single space so each row
 * stays on a single line.
 */
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * Render an `adr-index.md` document as a sorted Markdown table.
 *
 * Produces:
 *   - A header comment marking the file as auto-generated.
 *   - A table with columns `ID | Title | Status | Date | File`.
 *   - One row per input entry, ordered by `id` ascending. String compare
 *     suffices because ids are fixed-width `ADR-NNNN`.
 *
 * All entries are emitted — this function does not deduplicate. If the
 * caller needs uniqueness, it should dedupe beforehand. However, since
 * `nextAdrId` guarantees monotonically-increasing ids and `loadAllAdrs`
 * preserves whatever the filesystem contains, duplicates here indicate
 * user error upstream (two files claiming the same id) and are surfaced
 * faithfully in the rendered table.
 *
 * Table cells are escaped: pipe characters become `\|` and newlines
 * collapse to spaces so the table layout is never corrupted by exotic
 * titles or paths.
 *
 * Returns the rendered string with a trailing newline so the file is
 * POSIX-clean when written to disk.
 */
export function renderAdrIndex(adrs: AdrEntry[]): string {
  const sorted = [...adrs].sort((a, b) => {
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  const lines: string[] = [ADR_INDEX_HEADER, "", ADR_INDEX_TABLE_HEAD, ADR_INDEX_TABLE_SEP];
  for (const entry of sorted) {
    lines.push(
      `| ${escapeCell(entry.id)} | ${escapeCell(entry.title)} | ${escapeCell(entry.status)} | ${escapeCell(entry.date)} | ${escapeCell(entry.filePath)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Supersession
// ---------------------------------------------------------------------------

/**
 * Compute the ADR entries that must be updated as a consequence of a new
 * ADR that supersedes an existing one.
 *
 * Behaviour:
 *   - When `newAdr.supersedes` is not set, returns `[]`.
 *   - When `newAdr.supersedes` references an id that is not present in
 *     `allAdrs`, returns `[]` (superseding a non-existent ADR is a no-op —
 *     the caller may already have reported an error upstream).
 *   - Otherwise, returns a single-element list containing a copy of the
 *     matching old entry with `status` set to `"superseded"` and
 *     `superseded_by` set to `newAdr.id`.
 *
 * The function is pure: `newAdr` and `allAdrs` (and the entries within
 * `allAdrs`) are never mutated. Only the entries that actually need
 * updating are returned — callers can therefore treat the result as a
 * minimal diff to apply to disk, which avoids rewriting untouched ADRs.
 *
 * An entry whose `id` equals `newAdr.id` is ignored when scanning for a
 * match; an ADR cannot supersede itself.
 */
export function applySupersession(newAdr: AdrEntry, allAdrs: AdrEntry[]): AdrEntry[] {
  const targetId = newAdr.supersedes;
  if (targetId === undefined || targetId === "") {
    return [];
  }

  const updates: AdrEntry[] = [];
  for (const entry of allAdrs) {
    if (entry.id === newAdr.id) {
      continue;
    }
    if (entry.id === targetId) {
      updates.push({
        ...entry,
        status: "superseded",
        superseded_by: newAdr.id,
      });
    }
  }
  return updates;
}
