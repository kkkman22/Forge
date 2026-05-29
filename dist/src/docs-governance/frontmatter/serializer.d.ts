import type { Frontmatter } from "../types.js";
/**
 * Serializes a Frontmatter object back to a YAML frontmatter block.
 *
 * Field order: title → category → audience → updated → owner → mirror_of?
 * Arrays use block style (`- value`).
 * LF line endings. No trailing whitespace.
 * Closing `---` followed by exactly one LF + one empty line + body.
 */
export declare function serialize(fm: Frontmatter, body?: string): string;
