/**
 * Property-based and unit tests for the skill description validator.
 *
 * Covers:
 *   - Property: any description containing "Use when" (case-insensitive)
 *     with length ≤ 1024 and no forbidden pattern yields `valid=true`.
 *   - Unit tests for each failure mode: missing frontmatter, missing
 *     description, over-length description, missing "Use when", and one
 *     test per forbidden pattern (marketing / version / date).
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseSkillFrontmatter, validateDescription } from "../src/skill-description.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a SKILL.md document with the given description inside a
 * well-formed frontmatter block. Double quotes inside the description
 * are stripped so the quoted YAML value stays parsable by the shared
 * `extractStringField` helper.
 */
function buildSkillDoc(description: string, name = "forge-test"): string {
  const sanitised = description.replace(/"/g, "");
  return ["---", `name: ${name}`, `description: "${sanitised}"`, "---", "", "# Body", ""].join(
    "\n",
  );
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Arbitrary filler text that avoids the three forbidden patterns.
 *
 * We sample strings that only use lowercase letters, digits, spaces, and
 * a few harmless punctuation characters, then strip anything that could
 * accidentally form a date, a version tag, a marketing keyword, or a
 * literal "Use when" phrase we want to control independently.
 *
 * The forbidden patterns we guard against:
 *   - marketing keywords: 最好的, 革命性, best-ever, unbeatable
 *   - version tags: /\\bv\\d+\\.\\d+/
 *   - concrete dates: /\\b202\\d-\\d{2}-\\d{2}\\b/
 *
 * We also strip any pre-existing "use when" so the caller can choose
 * whether to inject the trigger phrase.
 */
const safeFillerArb: fc.Arbitrary<string> = fc
  .string({ unit: "grapheme-ascii", minLength: 0, maxLength: 300 })
  .map((s) => {
    // Replace embedded double quotes (clash with YAML quoting) and
    // newlines (would terminate the single-line value).
    let cleaned = s.replace(/["\n\r]/g, " ");
    // Strip marketing keywords (ASCII variants — generator is ascii).
    cleaned = cleaned.replace(/best-ever/gi, "b-ever");
    cleaned = cleaned.replace(/unbeatable/gi, "un-beatable");
    // Strip version-tag lookalikes: v followed by digits.digits.
    cleaned = cleaned.replace(/v(\d+)\.(\d+)/gi, "v$1_$2");
    // Strip date lookalikes: 202x-NN-NN.
    cleaned = cleaned.replace(/202\d-\d{2}-\d{2}/g, "date-elided");
    // Strip any pre-existing "use when" so tests stay deterministic.
    cleaned = cleaned.replace(/use\s+when/gi, "triggered if");
    return cleaned;
  });

// ---------------------------------------------------------------------------
// Property: any well-formed description → valid=true
// ---------------------------------------------------------------------------

describe("validateDescription — property-based", () => {
  /**
   * **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
   *
   * Universal property: a description that
   *   (a) contains "Use when" (case-insensitive),
   *   (b) is ≤ 1024 characters long, and
   *   (c) contains none of the forbidden patterns
   * must be declared valid by `validateDescription`.
   */
  it("contains Use when + ≤1024 chars + no forbidden → valid=true", () => {
    fc.assert(
      fc.property(safeFillerArb, safeFillerArb, (prefix, suffix) => {
        const description = `${prefix} Use when triggered by the tests. ${suffix}`.slice(0, 1024);
        const doc = buildSkillDoc(description);
        const result = validateDescription("skills/tinkerman-test/SKILL.md", doc);

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.hasUseWhen).toBe(true);
        expect(result.hasForbiddenPatterns).toEqual([]);
        expect(result.length).toBeLessThanOrEqual(1024);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests — individual failure modes
// ---------------------------------------------------------------------------

describe("validateDescription — unit", () => {
  it("flags missing frontmatter", () => {
    const result = validateDescription("skills/tinkerman-x/SKILL.md", "# Just a title\n");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("缺少 frontmatter");
  });

  it("flags missing description field", () => {
    const doc = ["---", "name: forge-x", "---", "", "# Body"].join("\n");
    const result = validateDescription("skills/tinkerman-x/SKILL.md", doc);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("description 字段缺失或为空");
  });

  it("flags empty description", () => {
    const doc = buildSkillDoc("");
    const result = validateDescription("skills/tinkerman-x/SKILL.md", doc);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("description 字段缺失或为空");
  });

  it("flags description > 1024 chars", () => {
    const filler = "a".repeat(1024);
    const description = `Use when overflow. ${filler}`;
    const doc = buildSkillDoc(description);
    const result = validateDescription("skills/tinkerman-x/SKILL.md", doc);
    expect(result.valid).toBe(false);
    expect(result.length).toBeGreaterThan(1024);
    expect(result.errors.some((e) => e.includes("description 超长"))).toBe(true);
  });

  it("flags missing 'Use when' trigger", () => {
    const description =
      "Processes incoming requests with a disciplined pipeline when the agent is idle.";
    const doc = buildSkillDoc(description);
    const result = validateDescription("skills/tinkerman-x/SKILL.md", doc);
    expect(result.valid).toBe(false);
    expect(result.hasUseWhen).toBe(false);
    expect(result.errors).toContain('description 缺少 "Use when" 触发语');
  });

  it("accepts case-insensitive 'Use When' with tab whitespace", () => {
    const description = "Runs checks. Use\tWhen the user invokes /tinkerman check.";
    const doc = buildSkillDoc(description);
    const result = validateDescription("skills/tinkerman-x/SKILL.md", doc);
    expect(result.valid).toBe(true);
    expect(result.hasUseWhen).toBe(true);
  });

  it("flags marketing language (Chinese)", () => {
    const description = "最好的调试工具。Use when user reports a bug.";
    const doc = buildSkillDoc(description);
    const result = validateDescription("skills/tinkerman-x/SKILL.md", doc);
    expect(result.valid).toBe(false);
    expect(result.hasForbiddenPatterns).toContain("营销性语言");
  });

  it("flags marketing language (English)", () => {
    const description = "The unbeatable pipeline. Use when user runs /tinkerman run.";
    const doc = buildSkillDoc(description);
    const result = validateDescription("skills/tinkerman-x/SKILL.md", doc);
    expect(result.valid).toBe(false);
    expect(result.hasForbiddenPatterns).toContain("营销性语言");
  });

  it("flags version numbers", () => {
    const description = "Supports v1.2 rollouts. Use when deploying to staging.";
    const doc = buildSkillDoc(description);
    const result = validateDescription("skills/tinkerman-x/SKILL.md", doc);
    expect(result.valid).toBe(false);
    expect(result.hasForbiddenPatterns).toContain("版本号");
  });

  it("flags concrete dates", () => {
    const description = "Active since 2026-05-05. Use when a new task arrives.";
    const doc = buildSkillDoc(description);
    const result = validateDescription("skills/tinkerman-x/SKILL.md", doc);
    expect(result.valid).toBe(false);
    expect(result.hasForbiddenPatterns).toContain("具体日期");
  });

  it("echoes the filePath unchanged", () => {
    const doc = buildSkillDoc("Does X. Use when Y happens.");
    const result = validateDescription("skills/tinkerman-demo/SKILL.md", doc);
    expect(result.filePath).toBe("skills/tinkerman-demo/SKILL.md");
  });
});

// ---------------------------------------------------------------------------
// parseSkillFrontmatter — direct tests
// ---------------------------------------------------------------------------

describe("parseSkillFrontmatter", () => {
  it("returns null when no frontmatter is present", () => {
    expect(parseSkillFrontmatter("# Just a heading\n")).toBeNull();
  });

  it("extracts name and description when both are present", () => {
    const doc = [
      "---",
      "name: tinkerman-demo",
      'description: "Does X. Use when Y."',
      "---",
      "",
      "# Body",
    ].join("\n");
    expect(parseSkillFrontmatter(doc)).toEqual({
      name: "tinkerman-demo",
      description: "Does X. Use when Y.",
    });
  });

  it("returns an object with missing fields absent", () => {
    const doc = ["---", "name: tinkerman-demo", "---", "", "# Body"].join("\n");
    const result = parseSkillFrontmatter(doc);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("tinkerman-demo");
    expect(result?.description).toBeUndefined();
  });
});
