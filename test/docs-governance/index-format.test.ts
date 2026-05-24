import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER, formatEntry, formatCategoryGroup, generateIndexFooter } from "../../src/docs-governance/index-generator/format.js";
import type { DocPair, DocPath, Frontmatter } from "../../src/docs-governance/types.js";

const makeFm = (overrides: Partial<Frontmatter> = {}): Frontmatter => ({
  title: "Test Doc",
  category: "reference",
  audience: ["maintainer"],
  updated: "2026-05-01",
  owner: "test",
  ...overrides,
});

const makePair = (slug: string, overrides: { cn?: Partial<Frontmatter>; en?: Partial<Frontmatter> } = {}): DocPair => ({
  slug,
  directory: "docs" as DocPath,
  cn: { path: `docs/${slug}.md` as any, domain: "A", frontmatter: makeFm({ title: slug, ...overrides.cn }), bodyHash: "" },
  en: overrides.en ? { path: `docs/${slug}.en.md` as any, domain: "A", frontmatter: makeFm({ title: `${slug} (EN)`, ...overrides.en }), bodyHash: "" } : undefined,
  state: overrides.en ? "paired" : "cn-only",
});

describe("CATEGORY_ORDER", () => {
  it("has 7 categories in correct order", () => {
    expect(CATEGORY_ORDER).toEqual([
      "getting-started", "daily-use", "advanced",
      "troubleshooting", "contributing", "reference", "audits",
    ]);
  });
});

describe("formatEntry", () => {
  it("formats cn-only entry", () => {
    const pair = makePair("guide");
    const result = formatEntry(pair);
    expect(result).toContain("[guide](docs/guide.md)");
    expect(result).toContain("reference");
    expect(result).toContain("2026-05-01");
  });

  it("formats paired entry with both links", () => {
    const pair = makePair("guide", { en: {} });
    const result = formatEntry(pair);
    expect(result).toContain("[guide](docs/guide.md)");
    expect(result).toContain("[guide (EN)](docs/guide.en.md)");
  });
});

describe("formatCategoryGroup", () => {
  it("formats group with heading", () => {
    const pairs = [makePair("guide")];
    const result = formatCategoryGroup("reference", pairs);
    expect(result).toContain("## Reference");
    expect(result).toContain("[guide](docs/guide.md)");
  });
});

describe("generateIndexFooter", () => {
  it("includes generation notice", () => {
    const result = generateIndexFooter();
    expect(result).toContain("scripts/build-docs-index.ts");
    expect(result).toContain("请勿手动编辑");
  });

  it("ends with single LF", () => {
    const result = generateIndexFooter();
    expect(result.endsWith("\n")).toBe(true);
    expect(result.endsWith("\n\n")).toBe(false);
  });
});
