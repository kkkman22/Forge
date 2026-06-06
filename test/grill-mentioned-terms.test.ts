/**
 * Tests for findMentionedTerms — glossary term matching in descriptions.
 *
 * Validates: Phase 3 T3 — findMentionedTerms test coverage.
 */
import { describe, expect, it } from "vitest";
import type { Glossary, GlossaryTerm } from "../src/glossary.js";
import { findMentionedTerms } from "../src/grill.js";

function makeGlossary(terms: Array<{ term: string; aliases?: string[] }>): Glossary {
  return {
    schema_version: 1,
    updated: "2026-06-06",
    terms: terms.map((t) => ({ term: t.term, aliases: t.aliases })) as GlossaryTerm[],
  };
}

describe("findMentionedTerms", () => {
  it("returns empty array for empty description", () => {
    const glossary = makeGlossary([{ term: "API" }]);
    expect(findMentionedTerms("", glossary)).toEqual([]);
  });

  it("returns empty array when no terms match", () => {
    const glossary = makeGlossary([{ term: "database" }]);
    expect(findMentionedTerms("auth system with tokens", glossary)).toEqual([]);
  });

  it("returns single matched term", () => {
    const glossary = makeGlossary([{ term: "authentication" }]);
    const result = findMentionedTerms("we need authentication", glossary);
    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("authentication");
  });

  it("returns terms in order of first appearance in description", () => {
    const glossary = makeGlossary([{ term: "cache" }, { term: "database" }, { term: "API" }]);
    const result = findMentionedTerms(
      "the API reads from the database and writes to cache",
      glossary,
    );
    expect(result.map((t) => t.term)).toEqual(["API", "database", "cache"]);
  });

  it("matches via alias", () => {
    const glossary = makeGlossary([{ term: "continuous integration", aliases: ["CI"] }]);
    const result = findMentionedTerms("configure CI pipeline", glossary);
    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("continuous integration");
  });

  it("matches case-insensitively", () => {
    const glossary = makeGlossary([{ term: "TypeScript" }]);
    const result = findMentionedTerms("using typescript for the backend", glossary);
    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("TypeScript");
  });

  it("deduplicates when term matched by multiple aliases", () => {
    const glossary = makeGlossary([{ term: "test", aliases: ["spec", "test"] }]);
    const result = findMentionedTerms("write a test spec", glossary);
    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("test");
  });

  it("handles large glossary efficiently (O(n+m) not O(n*m))", () => {
    // Build a glossary with 500 terms
    const terms = Array.from({ length: 500 }, (_, i) => ({
      term: `term${i}`,
      aliases: [`alias${i}`],
    }));
    const glossary = makeGlossary(terms);

    // Build a description that mentions only a few
    const description = "we need term42 and alias99 for this feature, also term250 is important";

    const start = Date.now();
    const result = findMentionedTerms(description, glossary);
    const elapsed = Date.now() - start;

    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(elapsed).toBeLessThan(100); // Should be fast, not O(n*m)
  });

  it("handles long description efficiently", () => {
    const glossary = makeGlossary([{ term: "alpha" }, { term: "beta" }, { term: "gamma" }]);
    const description = "filler ".repeat(50_000) + "alpha and beta appear here";

    const start = Date.now();
    const result = findMentionedTerms(description, glossary);
    const elapsed = Date.now() - start;

    expect(result.map((t) => t.term).sort()).toEqual(["alpha", "beta"]);
    expect(elapsed).toBeLessThan(200);
  });
});
