/**
 * Unified frontmatter parsing module.
 *
 * Provides a single implementation of YAML frontmatter parsing shared by
 * quality-gate.ts, handoff.ts, and state.ts. Eliminates duplicated parsing
 * logic and ensures boundary inputs produce consistent results across all
 * modules.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed YAML frontmatter result. */
export interface ParsedFrontmatter {
  /** Raw frontmatter text between delimiters (without the --- lines). */
  raw: string;
  /** Body content after the closing delimiter. */
  body: string;
}

/**
 * Parsed frontmatter that additionally captures the leading whitespace trimmed
 * off the start, so callers can round-trip-preserve the original prefix.
 *
 * P2-4: this shape is what status-file-ext.ts and execution-mode.ts previously
 * each maintained as a private clone. Consolidated here as the single adapter
 * over {@link parseFrontmatter}.
 * @public
 */
export interface ParsedFrontmatterWithLeading {
  /** Raw frontmatter text between delimiters (same as {@link ParsedFrontmatter.raw}). */
  frontmatter: string;
  /** Body content after the closing delimiter. */
  body: string;
  /** Leading whitespace that was trimmed from the content start. */
  leadingWhitespace: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** YAML frontmatter delimiter. */
const FRONTMATTER_DELIMITER = "---";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escape regex special characters in a string so it can be safely used
 * inside a `new RegExp(...)` constructor as a literal match.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Regex cache — avoids recompiling the same pattern per fieldName
// ---------------------------------------------------------------------------

const regexCache = new Map<string, RegExp>();

function getCachedRegex(key: string, build: () => RegExp): RegExp {
  let re = regexCache.get(key);
  if (re === undefined) {
    re = build();
    regexCache.set(key, re);
  }
  return re;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the YAML frontmatter block from content.
 * Returns the frontmatter string (without delimiters) and the body after it,
 * or null if no valid frontmatter is found.
 *
 * Rules:
 *   - Content must start with "---" (leading whitespace is trimmed)
 *   - A closing "---" must appear on its own line after the opening
 *   - The body is everything after the closing delimiter line
 */
export function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const trimmed = content.trimStart();

  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    return null;
  }

  const afterFirst = trimmed.slice(FRONTMATTER_DELIMITER.length);
  const closingIndex = afterFirst.indexOf(`\n${FRONTMATTER_DELIMITER}`);
  if (closingIndex === -1) {
    return null;
  }

  const raw = afterFirst.slice(0, closingIndex);
  const afterClosing = afterFirst.slice(closingIndex + 1 + FRONTMATTER_DELIMITER.length);

  const bodyStart = afterClosing.indexOf("\n");
  const body = bodyStart === -1 ? "" : afterClosing.slice(bodyStart + 1);

  return { raw, body };
}

/**
 * Parse frontmatter while preserving the leading whitespace of the original
 * content (so callers that rewrite the file can re-prepend it exactly).
 *
 * Returns `{ frontmatter, body, leadingWhitespace } | null`. This is the
 * consolidated adapter replacing the private clones in status-file-ext.ts and
 * execution-mode.ts (P2-4). `frontmatter` here is the raw text between
 * delimiters (same value as {@link ParsedFrontmatter.raw}, named to match the
 * legacy callers' field).
 * @public
 */
export function parseFrontmatterPreservingLeading(
  content: string,
): ParsedFrontmatterWithLeading | null {
  const leadingWhitespace = content.slice(0, content.length - content.trimStart().length);
  const parsed = parseFrontmatter(content);
  if (parsed === null) return null;
  return {
    frontmatter: parsed.raw,
    body: parsed.body,
    leadingWhitespace,
  };
}

/**
 * Extract a string field value from raw frontmatter text.
 * Returns the value or null if the field is missing.
 *
 * Handles optional surrounding double quotes on the value.
 */
export function extractStringField(frontmatter: string, fieldName: string): string | null {
  const escaped = escapeRegExp(fieldName);
  const regex = getCachedRegex(
    `str:${fieldName}`,
    () => new RegExp(`^${escaped}:\\s*"?([^"\\n]*)"?\\s*$`, "m"),
  );
  const match = frontmatter.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract a YAML list field from raw frontmatter text.
 * Supports the indented list syntax:
 * ```
 * context_files:
 *   - specs/api-design.md
 *   - specs/data-model.md
 * ```
 *
 * Returns an array of string items, or an empty array if the field is missing
 * or has no list items.
 *
 * **Validates: Requirements 1.1**
 */
export function extractListField(frontmatter: string, fieldName: string): string[] {
  const lines = frontmatter.split("\n");
  let collecting = false;
  const items: string[] = [];

  const escaped = escapeRegExp(fieldName);
  const headerPattern = getCachedRegex(
    `list:hdr:${fieldName}`,
    () => new RegExp(`^${escaped}:\\s*$`),
  );
  const emptyArrayPattern = getCachedRegex(
    `list:empty:${fieldName}`,
    () => new RegExp(`^${escaped}:\\s*\\[\\]\\s*$`),
  );

  for (const line of lines) {
    // Match the field header line (e.g. "context_files:")
    if (!collecting) {
      if (headerPattern.test(line)) {
        collecting = true;
        continue;
      }
      // Also handle inline empty array: "context_files: []"
      if (emptyArrayPattern.test(line)) {
        return [];
      }
      continue;
    }

    // While collecting, match indented list items: "  - value"
    const itemMatch = line.match(/^\s+-\s+(.+)$/);
    if (itemMatch) {
      items.push(itemMatch[1].trim());
    } else if (line.trim() === "") {
    } else {
      // Non-list-item, non-empty line — stop collecting
      break;
    }
  }

  return items;
}

/**
 * Extract a numeric field value from raw frontmatter text.
 * Returns the parsed number or null if the field is missing or not a valid number.
 */
export function extractNumericField(frontmatter: string, fieldName: string): number | null {
  const escaped = escapeRegExp(fieldName);
  const regex = getCachedRegex(`num:${fieldName}`, () => new RegExp(`^${escaped}:\\s*(.+)$`, "m"));
  const match = frontmatter.match(regex);
  if (!match) {
    return null;
  }
  const value = Number(match[1].trim());
  return Number.isNaN(value) ? null : value;
}
