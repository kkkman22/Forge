import { describe, expect, it } from "vitest";
import { fileNameToContext, parseFrontmatter, splitByH3 } from "../src/glossary/registry.js";
import { extractInstinctSources, normalizeSource, } from "../src/knowledge-integrity.js";
describe("glossary/registry: fileNameToContext", () => {
    it("strips .md extension", () => {
        expect(fileNameToContext("billing.md")).toBe("billing");
        expect(fileNameToContext("no-ext")).toBe("no-ext");
    });
    it("handles empty string", () => {
        expect(fileNameToContext("")).toBe("");
    });
});
describe("glossary/registry: splitByH3", () => {
    it("splits content by ### headings", () => {
        const parts = splitByH3("### First\ncontent1\n### Second\ncontent2");
        expect(parts.length).toBe(2);
    });
    it("returns single part for no headings", () => {
        expect(splitByH3("just text").length).toBe(1);
    });
    it("returns [] for empty content", () => {
        expect(splitByH3("")).toEqual([]);
    });
    it("filters empty parts", () => {
        expect(splitByH3("### A\nx\n\n\n").length).toBe(1);
    });
});
describe("glossary/registry: parseFrontmatter", () => {
    it("parses key: value pairs", () => {
        const r = parseFrontmatter("key: value\nnum: 42");
        expect(r.key).toBe("value");
    });
    it("parses array values", () => {
        const r = parseFrontmatter('tags: [a, "b", c]');
        expect(r.tags).toEqual(["a", "b", "c"]);
    });
    it("handles null values", () => {
        const r = parseFrontmatter("key: null");
        expect(r).toBeDefined();
    });
    it("handles empty input", () => {
        expect(Object.keys(parseFrontmatter("")).length).toBe(0);
    });
    it("skips non-key lines", () => {
        const r = parseFrontmatter("not a key: value\nreal: yes");
        expect(r.real).toBe("yes");
    });
});
describe("knowledge-integrity: normalizeSource", () => {
    it("lowercases + strips .md + replaces spaces", () => {
        expect(normalizeSource("Billing Module.md")).toBe("billing-module");
    });
    it("removes non-alphanumeric (keeps CJK)", () => {
        expect(normalizeSource("test!@#")).toBe("test");
        expect(normalizeSource("计费")).toBe("计费");
    });
    it("handles empty string", () => {
        expect(normalizeSource("")).toBe("");
    });
});
describe("knowledge-integrity: extractInstinctSources", () => {
    it("extracts sources from instinct content", () => {
        const content = "### Pattern A\n\n**定义**: test\n\n**来源**: session-2026-06-14.md\n";
        const sources = extractInstinctSources(content);
        expect(Array.isArray(sources)).toBe(true);
    });
    it("returns [] for content with no sources", () => {
        expect(extractInstinctSources("### Pattern\n\nno source here")).toEqual([]);
    });
    it("returns [] for empty content", () => {
        expect(extractInstinctSources("")).toEqual([]);
    });
});
//# sourceMappingURL=registry-integrity-branches.test.js.map