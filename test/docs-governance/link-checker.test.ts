import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { gfmAnchor, dedupAnchorsInDoc, extractLinks } from "../../src/docs-governance/link-checker.js";

describe("gfmAnchor", () => {
  it("lowercases ASCII letters", () => {
    expect(gfmAnchor("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with dashes", () => {
    expect(gfmAnchor("foo bar baz")).toBe("foo-bar-baz");
  });

  it("removes non-dash non-underscore ASCII punctuation", () => {
    expect(gfmAnchor("what's this?")).toBe("whats-this");
  });

  it("preserves CJK characters", () => {
    expect(gfmAnchor("入门指南")).toBe("入门指南");
  });

  it("preserves digits", () => {
    expect(gfmAnchor("Step 1")).toBe("step-1");
  });

  it("preserves dashes from literal dash and spaces", () => {
    // "foo -- bar" → "foo" + "-"(space) + "--"(literal) + "-"(space) + "bar"
    expect(gfmAnchor("foo -- bar")).toBe("foo----bar");
  });

  it("handles mixed CJK and ASCII", () => {
    const result = gfmAnchor("快速开始 Quick Start");
    expect(result).toContain("快速开始");
    expect(result).toContain("quick-start");
  });

  // PBT: GFM anchor consistency (P11)
  it("PBT: anchor output only contains allowed chars", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (text) => {
        const anchor = gfmAnchor(text);
        // Allowed: lowercase ascii letters, digits, CJK, dash, underscore
        const allowed = /^[a-z0-9一-鿿㐀-䶿\-\s]*$/;
        // Note: spaces are converted to dashes, so no spaces in output
        for (const ch of anchor) {
          const isLowerAlpha = ch >= "a" && ch <= "z";
          const isDigit = ch >= "0" && ch <= "9";
          const isCJK = ch >= "一" && ch <= "鿿";
          const isDash = ch === "-";
          const isUnderscore = ch === "_";
          expect(isLowerAlpha || isDigit || isCJK || isDash || isUnderscore).toBe(true);
        }
      }),
    );
  });
});

describe("dedupAnchorsInDoc", () => {
  it("appends -1, -2 for duplicate headings", () => {
    const headings = [
      { text: "Introduction", anchor: "" },
      { text: "Details", anchor: "" },
      { text: "Introduction", anchor: "" },
    ];
    dedupAnchorsInDoc(headings);
    expect(headings[0].anchor).toBe("introduction");
    expect(headings[1].anchor).toBe("details");
    expect(headings[2].anchor).toBe("introduction-1");
  });

  it("handles three duplicates", () => {
    const headings = [
      { text: "Test", anchor: "" },
      { text: "Test", anchor: "" },
      { text: "Test", anchor: "" },
    ];
    dedupAnchorsInDoc(headings);
    expect(headings[0].anchor).toBe("test");
    expect(headings[1].anchor).toBe("test-1");
    expect(headings[2].anchor).toBe("test-2");
  });
});

describe("extractLinks", () => {
  it("extracts inline links", () => {
    const text = "See [docs](./guide.md) for details.";
    const links = extractLinks(text);
    expect(links).toContainEqual(expect.objectContaining({ target: "./guide.md" }));
  });

  it("extracts image links", () => {
    const text = "![alt](./img.png)";
    const links = extractLinks(text);
    expect(links).toContainEqual(expect.objectContaining({ target: "./img.png" }));
  });

  it("skips links inside fenced code blocks", () => {
    const text = "```\n[bad](./link.md)\n```\n[good](./real.md)";
    const links = extractLinks(text);
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe("./real.md");
  });

  it("skips http/https/mailto/tel links", () => {
    const text = "[web](https://example.com) [mail](mailto:a@b.c)";
    const links = extractLinks(text);
    expect(links).toHaveLength(0);
  });

  it("extracts reference-style links", () => {
    const text = "[text][ref]\n\n[ref]: ./page.md";
    const links = extractLinks(text);
    expect(links.some((l) => l.target === "./page.md")).toBe(true);
  });
});
