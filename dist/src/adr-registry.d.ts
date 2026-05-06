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
}
/** Loaded ADR record with the source file path attached. */
export interface AdrEntry extends AdrFrontmatter {
    filePath: string;
}
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
export declare function parseAdrFrontmatter(content: string): AdrFrontmatter | null;
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
export declare function loadAllAdrs(entries: string[], readFile: (path: string) => string | undefined): AdrEntry[];
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
export declare function nextAdrId(existing: AdrEntry[]): string;
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
export declare function findRelatedAdrs(taskDescription: string, adrs: AdrEntry[], limit: number): AdrEntry[];
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
export declare function renderAdrIndex(adrs: AdrEntry[]): string;
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
export declare function applySupersession(newAdr: AdrEntry, allAdrs: AdrEntry[]): AdrEntry[];
