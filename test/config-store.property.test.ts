/**
 * Property-based tests for the ConfigStore module.
 *
 * Covers:
 *   - Property 9: Config lang 字段往返与字段保留
 *
 * **Validates: Requirements 6.1, 6.4**
 *
 * Feature: i18n-support, Property 9: Config lang 字段往返与字段保留
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    buildDefaultConfig,
    extractConfigLang,
    writeConfigLang,
} from "../src/config-store.js";
import { extractStringField, parseFrontmatter } from "../src/frontmatter.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a valid YAML field name (simple alphanumeric + underscore). */
const fieldNameArb = fc
  .stringMatching(/^[a-z][a-z0-9_]{0,19}$/)
  .filter((s) => s.length >= 1 && s !== "lang");

/** Generate a simple string value (no quotes, no newlines, no ---). */
const simpleValueArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0)
  .filter((s) => !s.includes("\n"))
  .filter((s) => !s.includes("---"))
  .filter((s) => !s.includes('"'))
  .map((s) => s.trim());

/** Generate a locale string (realistic language codes). */
const localeArb = fc.oneof(
  fc.constantFrom("zh", "en", "ja", "ko", "fr", "de", "es", "pt", "ru", "ar"),
  fc.stringMatching(/^[a-z]{2,3}$/).filter((s) => s.length >= 2),
);

/** Generate a set of non-lang frontmatter fields as key-value pairs. */
const otherFieldsArb = fc
  .array(fc.tuple(fieldNameArb, simpleValueArb), { minLength: 0, maxLength: 5 })
  .map((pairs) => {
    const seen = new Set<string>();
    return pairs.filter(([key]) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

/** Generate body content that doesn't interfere with frontmatter parsing. */
const bodyArb = fc
  .string({ minLength: 0, maxLength: 50 })
  .filter((s) => !s.trimStart().startsWith("---"));

/**
 * Build config.md content with optional lang field and other fields.
 */
function buildConfigContent(
  otherFields: [string, string][],
  lang: string | null,
  body: string,
): string {
  const lines: string[] = ["---"];
  for (const [key, value] of otherFields) {
    lines.push(`${key}: ${value}`);
  }
  if (lang !== null) {
    lines.push(`lang: ${lang}`);
  }
  lines.push("---");
  if (body) {
    lines.push(body);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Feature: i18n-support, Property 9: Config lang 字段往返与字段保留
// ---------------------------------------------------------------------------

describe("Feature: i18n-support, Property 9: Config lang 字段往返与字段保留", () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any config.md content (with or without existing lang field) and any
   * locale string, writing the lang field via writeConfigLang() then
   * extracting via extractConfigLang() returns the written locale.
   */
  it("round-trip: extractConfigLang(writeConfigLang(content, lang)) === lang", () => {
    fc.assert(
      fc.property(otherFieldsArb, localeArb, bodyArb, (fields, lang, body) => {
        // Content with existing lang field
        const contentWithLang = buildConfigContent(fields, "en", body);
        const updatedWithLang = writeConfigLang(contentWithLang, lang);
        expect(extractConfigLang(updatedWithLang)).toBe(lang);

        // Content without lang field
        const contentWithoutLang = buildConfigContent(fields, null, body);
        const updatedWithoutLang = writeConfigLang(contentWithoutLang, lang);
        expect(extractConfigLang(updatedWithoutLang)).toBe(lang);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * Round-trip works when content has no frontmatter at all.
   */
  it("round-trip works on content with no frontmatter", () => {
    fc.assert(
      fc.property(localeArb, bodyArb, (lang, body) => {
        // Content without any frontmatter
        const plainContent = body.trimStart().startsWith("---") ? `# ${body}` : body;
        const updated = writeConfigLang(plainContent, lang);
        expect(extractConfigLang(updated)).toBe(lang);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * Round-trip works on empty content.
   */
  it("round-trip works on empty content", () => {
    fc.assert(
      fc.property(localeArb, (lang) => {
        const updated = writeConfigLang("", lang);
        expect(extractConfigLang(updated)).toBe(lang);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * For any config.md content with arbitrary frontmatter fields (excluding
   * lang), writing a lang field preserves all other fields unchanged.
   */
  it("writeConfigLang preserves all other frontmatter fields", () => {
    fc.assert(
      fc.property(otherFieldsArb, localeArb, bodyArb, (fields, lang, body) => {
        if (fields.length === 0) return; // skip when no other fields to check

        const content = buildConfigContent(fields, null, body);
        const updated = writeConfigLang(content, lang);

        // Parse the updated content and verify all original fields are present
        const parsed = parseFrontmatter(updated);
        expect(parsed).not.toBeNull();
        if (parsed === null) return;

        for (const [key, value] of fields) {
          const extracted = extractStringField(parsed.raw, key);
          expect(extracted).toBe(value);
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * Updating an existing lang field preserves all other fields.
   */
  it("updating existing lang preserves other fields", () => {
    fc.assert(
      fc.property(
        otherFieldsArb,
        localeArb,
        localeArb,
        bodyArb,
        (fields, oldLang, newLang, body) => {
          if (fields.length === 0) return;

          const content = buildConfigContent(fields, oldLang, body);
          const updated = writeConfigLang(content, newLang);

          // Verify lang was updated
          expect(extractConfigLang(updated)).toBe(newLang);

          // Verify other fields are preserved
          const parsed = parseFrontmatter(updated);
          expect(parsed).not.toBeNull();
          if (parsed === null) return;

          for (const [key, value] of fields) {
            const extracted = extractStringField(parsed.raw, key);
            expect(extracted).toBe(value);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * buildDefaultConfig produces content where extractConfigLang returns
   * the provided lang.
   */
  it("buildDefaultConfig produces extractable lang", () => {
    fc.assert(
      fc.property(localeArb, (lang) => {
        const content = buildDefaultConfig(lang);
        expect(extractConfigLang(content)).toBe(lang);
      }),
      { numRuns: 200 },
    );
  });
});
