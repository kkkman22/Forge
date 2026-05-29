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
/** Parsed YAML frontmatter result. */
export interface ParsedFrontmatter {
    /** Raw frontmatter text between delimiters (without the --- lines). */
    raw: string;
    /** Body content after the closing delimiter. */
    body: string;
}
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
export declare function parseFrontmatter(content: string): ParsedFrontmatter | null;
/**
 * Extract a string field value from raw frontmatter text.
 * Returns the value or null if the field is missing.
 *
 * Handles optional surrounding double quotes on the value.
 */
export declare function extractStringField(frontmatter: string, fieldName: string): string | null;
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
export declare function extractListField(frontmatter: string, fieldName: string): string[];
/**
 * Extract a numeric field value from raw frontmatter text.
 * Returns the parsed number or null if the field is missing or not a valid number.
 */
export declare function extractNumericField(frontmatter: string, fieldName: string): number | null;
