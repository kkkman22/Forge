import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../src/docs-governance/frontmatter/parser.js";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const VALID_YAML = [
  "---",
  "title: Getting Started",
  "category: getting-started",
  "audience:",
  "  - new-user",
  "updated: '2026-05-01'",
  "owner: Forge Team",
  "---",
].join("\n");

const BODY = "\n# Getting Started\n\nWelcome to Forge.\n";

// ─────────────────────────────────────────────────────────────
// Valid parse
// ─────────────────────────────────────────────────────────────
describe("parseFrontmatter — valid input", () => {
  it("parses valid YAML to Frontmatter", () => {
    const result = parseFrontmatter(VALID_YAML + BODY);
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter!.title).toBe("Getting Started");
    expect(result.frontmatter!.category).toBe("getting-started");
    expect(result.frontmatter!.audience).toEqual(["new-user"]);
    expect(result.frontmatter!.updated).toBe("2026-05-01");
    expect(result.frontmatter!.owner).toBe("Forge Team");
    expect(result.diagnostics).toHaveLength(0);
  });

  it("returns body after frontmatter block", () => {
    const result = parseFrontmatter(VALID_YAML + BODY);
    expect(result.body).toContain("# Getting Started");
    expect(result.body).toContain("Welcome to Forge.");
  });

  it("returns body even when no frontmatter content", () => {
    const markdown = "Just plain text\nNo frontmatter here.";
    const result = parseFrontmatter(markdown);
    expect(result.body).toBe(markdown);
  });
});

// ─────────────────────────────────────────────────────────────
// Unknown fields
// ─────────────────────────────────────────────────────────────
describe("parseFrontmatter — unknown fields", () => {
  it("produces diagnostic for unknown field", () => {
    const text = [
      "---",
      "title: Test",
      "category: reference",
      "audience:",
      "  - new-user",
      "updated: '2026-05-01'",
      "owner: Team",
      "unknown_field: oops",
      "---",
      "Body",
    ].join("\n");

    const result = parseFrontmatter(text);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(
      result.diagnostics.some(
        (d) => d.message.includes("unrecognized") || d.message.includes("Unrecognized"),
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// BOM tolerance
// ─────────────────────────────────────────────────────────────
describe("parseFrontmatter — BOM tolerance", () => {
  it("handles BOM at start of text", () => {
    const bom = "﻿";
    const text = bom + VALID_YAML + BODY;
    const result = parseFrontmatter(text);
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter!.title).toBe("Getting Started");
    expect(result.diagnostics).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Frontmatter block boundary
// ─────────────────────────────────────────────────────────────
describe("parseFrontmatter — block boundary", () => {
  it("requires --- on first line", () => {
    const text = "Not frontmatter\n---\ntitle: Test\n---\nBody";
    const result = parseFrontmatter(text);
    // Should treat this as no frontmatter since --- is not on first line
    expect(result.frontmatter).toBeNull();
  });

  it("requires second standalone --- to close", () => {
    // Only opening --- with no closing ---
    const text =
      "---\ntitle: Test\ncategory: getting-started\naudience:\n  - new-user\nupdated: '2026-05-01'\nowner: Team\nNo closing markers";
    const result = parseFrontmatter(text);
    // No closing --- means no valid frontmatter block
    expect(result.frontmatter).toBeNull();
  });

  it("does not treat --- in body as frontmatter boundary", () => {
    const text = `${VALID_YAML}\n---\nThis is a horizontal rule in body\n`;
    const result = parseFrontmatter(text);
    expect(result.frontmatter).not.toBeNull();
    // The third --- should be part of body
    expect(result.body).toContain("This is a horizontal rule in body");
  });
});

// ─────────────────────────────────────────────────────────────
// Missing frontmatter
// ─────────────────────────────────────────────────────────────
describe("parseFrontmatter — missing frontmatter", () => {
  it("returns null frontmatter and diagnostic for text without frontmatter", () => {
    const text = "No frontmatter here.\nJust markdown.";
    const result = parseFrontmatter(text);
    expect(result.frontmatter).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("returns diagnostic for empty YAML between --- markers", () => {
    const text = "---\n---\nBody";
    const result = parseFrontmatter(text);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Nested maps rejected
// ─────────────────────────────────────────────────────────────
describe("parseFrontmatter — nested maps", () => {
  it("rejects nested map values", () => {
    const text = [
      "---",
      "title: Test",
      "category: reference",
      "audience:",
      "  - new-user",
      "updated: '2026-05-01'",
      "owner: Team",
      "nested:",
      "  key: value",
      "---",
      "Body",
    ].join("\n");

    const result = parseFrontmatter(text);
    // Should produce a diagnostic (unknown field 'nested' or rejected nested map)
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
