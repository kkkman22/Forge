/**
 * ConfigStore module — pure functions for reading and writing the `lang`
 * field in `.forge/config.md` frontmatter.
 *
 * Reuses `parseFrontmatter()` and `extractStringField()` from `frontmatter.ts`
 * to avoid duplicating YAML parsing logic. All functions are pure: they accept
 * content strings and return results with no I/O side effects.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 */

import { extractStringField, parseFrontmatter } from "./frontmatter.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The frontmatter field name used to store the language preference. */
const LANG_FIELD = "lang";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the `lang` field from config.md content.
 *
 * Reuses `parseFrontmatter()` + `extractStringField()` from frontmatter.ts.
 *
 * @param content - The full config.md file content
 * @returns The `lang` field value, or `null` if missing or no frontmatter
 */
export function extractConfigLang(content: string): string | null {
  const parsed = parseFrontmatter(content);
  if (parsed === null) {
    return null;
  }
  return extractStringField(parsed.raw, LANG_FIELD);
}

/**
 * Write (or update) the `lang` field in config.md content.
 *
 * Behaviour:
 *   - If the content already has frontmatter with a `lang` field, update it.
 *   - If the content has frontmatter but no `lang` field, append it.
 *   - If the content has no frontmatter, create a full frontmatter block.
 *
 * All other existing frontmatter fields are preserved unchanged.
 *
 * @param content - Existing config.md content (may be empty)
 * @param lang - The language code to write
 * @returns Updated config.md content
 */
export function writeConfigLang(content: string, lang: string): string {
  const parsed = parseFrontmatter(content);

  if (parsed === null) {
    // No frontmatter — create a new frontmatter block and prepend it
    const frontmatter = `---\n${LANG_FIELD}: ${lang}\n---\n`;
    const trimmed = content.trimStart();
    if (trimmed.length === 0) {
      return frontmatter;
    }
    return `${frontmatter}${trimmed}`;
  }

  // Frontmatter exists — check if lang field is already present
  const existingLang = extractStringField(parsed.raw, LANG_FIELD);

  let updatedRaw: string;
  if (existingLang !== null) {
    // Replace existing lang field value
    const langLineRegex = new RegExp(`^(${LANG_FIELD}:\\s*).*$`, "m");
    updatedRaw = parsed.raw.replace(langLineRegex, `$1${lang}`);
  } else {
    // Append lang field to existing frontmatter
    updatedRaw = `${parsed.raw}\n${LANG_FIELD}: ${lang}`;
  }

  // Reconstruct the full content
  const body = parsed.body;
  if (body.length === 0) {
    return `---${updatedRaw}\n---\n`;
  }
  return `---${updatedRaw}\n---\n${body}`;
}

/**
 * Generate default config.md content with a frontmatter block containing
 * the `lang` field.
 *
 * @param lang - The language code to include
 * @returns A complete config.md content string
 */
export function buildDefaultConfig(lang: string): string {
  return `---\n${LANG_FIELD}: ${lang}\n---\n`;
}
