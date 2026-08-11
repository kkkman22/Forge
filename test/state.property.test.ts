/**
 * Property 15: 状态文件格式统一
 *
 * Uses fast-check to generate .tinkerman/ state files, verifying that:
 *   - File extension is .md
 *   - Structured data uses YAML frontmatter
 *
 * **Validates: Requirements 11.2**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  hasMarkdownExtension,
  hasYamlFrontmatter,
  type StateFile,
  validateStateFile,
} from "../src/state.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Known .tinkerman/ subdirectories and file patterns. */
const forgeSubdirs = [
  "config",
  "status",
  "decisions/2025-01-15-topic",
  "specs/feature/spec",
  "plans/topic",
  "findings/topic",
  "progress/topic",
  "reviews/topic",
  "knowledge/solutions/topic",
  "knowledge/instincts",
  "debug/topic",
] as const;

/** A valid .tinkerman/ file path (always .md extension). */
const validPathArb: fc.Arbitrary<string> = fc
  .constantFrom(...forgeSubdirs)
  .map((base) => `${base}.md`);

/** A valid YAML frontmatter block. */
const validFrontmatterContentArb: fc.Arbitrary<string> = fc
  .tuple(
    fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => s.trim().length > 0 && !s.includes("---")),
    fc.string({ minLength: 0, maxLength: 50 }).filter((s) => !s.includes("---")),
  )
  .map(([key, value]) => `---\n${key}: ${value}\n---\n`);

/** Body content after frontmatter. */
const bodyContentArb: fc.Arbitrary<string> = fc
  .string({ minLength: 0, maxLength: 100 })
  .filter((s) => !s.trimStart().startsWith("---"));

/** A valid state file with .md extension and YAML frontmatter. */
const validStateFileArb: fc.Arbitrary<StateFile> = fc
  .tuple(validPathArb, validFrontmatterContentArb, bodyContentArb)
  .map(([path, frontmatter, body]) => ({
    path,
    content: frontmatter + body,
  }));

/** A file path with non-.md extension. */
const invalidExtensionPathArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...forgeSubdirs),
    fc.constantFrom(".txt", ".json", ".yaml", ".yml", ".html", ".xml"),
  )
  .map(([base, ext]) => `${base}${ext}`);

/** Content without YAML frontmatter. */
const noFrontmatterContentArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => !s.trimStart().startsWith("---"));

/** A state file with invalid extension (not .md). */
const invalidExtensionFileArb: fc.Arbitrary<StateFile> = fc
  .tuple(invalidExtensionPathArb, validFrontmatterContentArb, bodyContentArb)
  .map(([path, frontmatter, body]) => ({
    path,
    content: frontmatter + body,
  }));

/** A state file with .md extension but no YAML frontmatter. */
const noFrontmatterFileArb: fc.Arbitrary<StateFile> = fc
  .tuple(validPathArb, noFrontmatterContentArb)
  .map(([path, content]) => ({
    path,
    content,
  }));

/** A topic name for dynamic path generation. */
const topicArb: fc.Arbitrary<string> = fc
  .string({ minLength: 3, maxLength: 20 })
  .map((s) => s.replace(/[^a-z0-9-]/gi, "a").toLowerCase())
  .filter((s) => s.length >= 3 && /^[a-z]/.test(s));

/** A dynamically generated valid state file path. */
const dynamicValidPathArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(
      "decisions/",
      "specs/",
      "plans/",
      "findings/",
      "progress/",
      "reviews/",
      "knowledge/solutions/",
      "debug/",
    ),
    topicArb,
  )
  .map(([dir, topic]) => `${dir}${topic}.md`);

/** A dynamically generated valid state file. */
const dynamicValidStateFileArb: fc.Arbitrary<StateFile> = fc
  .tuple(dynamicValidPathArb, validFrontmatterContentArb, bodyContentArb)
  .map(([path, frontmatter, body]) => ({
    path,
    content: frontmatter + body,
  }));

// ---------------------------------------------------------------------------
// Property 15: 状态文件格式统一
// ---------------------------------------------------------------------------

describe("Property 15: 状态文件格式统一", () => {
  it("valid state files pass validation (Req 11.2)", () => {
    fc.assert(
      fc.property(validStateFileArb, (file) => {
        const result = validateStateFile(file);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 50 },
    );
  });

  it("all state file paths have .md extension (Req 11.2)", () => {
    fc.assert(
      fc.property(validStateFileArb, (file) => {
        expect(hasMarkdownExtension(file.path)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("all state file content has YAML frontmatter (Req 11.2)", () => {
    fc.assert(
      fc.property(validStateFileArb, (file) => {
        expect(hasYamlFrontmatter(file.content)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("files with non-.md extension fail validation (Req 11.2)", () => {
    fc.assert(
      fc.property(invalidExtensionFileArb, (file) => {
        const result = validateStateFile(file);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("扩展名"))).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("files without YAML frontmatter fail validation (Req 11.2)", () => {
    fc.assert(
      fc.property(noFrontmatterFileArb, (file) => {
        const result = validateStateFile(file);

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("YAML frontmatter"))).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("dynamically generated state files pass validation (Req 11.2)", () => {
    fc.assert(
      fc.property(dynamicValidStateFileArb, (file) => {
        const result = validateStateFile(file);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 50 },
    );
  });

  it("hasMarkdownExtension correctly identifies .md files", () => {
    fc.assert(
      fc.property(
        fc.tuple(topicArb, fc.constantFrom(".md", ".txt", ".json", ".yaml")),
        ([topic, ext]) => {
          const path = `${topic}${ext}`;
          expect(hasMarkdownExtension(path)).toBe(ext === ".md");
        },
      ),
      { numRuns: 50 },
    );
  });

  it("hasYamlFrontmatter correctly identifies frontmatter content", () => {
    fc.assert(
      fc.property(validFrontmatterContentArb, bodyContentArb, (frontmatter, body) => {
        const content = frontmatter + body;
        expect(hasYamlFrontmatter(content)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("hasYamlFrontmatter rejects content without frontmatter", () => {
    fc.assert(
      fc.property(noFrontmatterContentArb, (content) => {
        expect(hasYamlFrontmatter(content)).toBe(false);
      }),
      { numRuns: 50 },
    );
  });
});
