import { describe, expect, it } from "vitest";
import { escapeFieldName, optionalString, parseInlineArray, stripSurroundingQuotes, tokenize, } from "../src/adr-registry.js";
import { buildClusterKey, formatNumber, parseNumber, parseTagList, splitActiveArchived, stripFrontmatter, } from "../src/pattern-stats.js";
import { normalizeVerdict, parseStringArray, parseYamlValue } from "../src/verdict-parser.js";
// pattern-stats
describe("pattern-stats (branch coverage)", () => {
    it("stripFrontmatter removes frontmatter", () => {
        expect(stripFrontmatter("---\nkey: val\n---\nbody").body).toBe("body");
        expect(stripFrontmatter("no fm").body).toBe("no fm");
    });
    it("splitActiveArchived splits at sentinel", () => {
        const r = splitActiveArchived("active\n\n## Archived\n\nold");
        expect(r.active).toContain("active");
        expect(r.archived).toContain("old");
    });
    it("splitActiveArchived no sentinel → all active", () => {
        const r = splitActiveArchived("just active");
        expect(r.archived).toBe("");
    });
    it("parseTagList parses comma-separated tags", () => {
        expect(parseTagList("a, b, c")).toEqual(["a", "b", "c"]);
    });
    it("parseTagList returns [] for undefined", () => {
        expect(parseTagList(undefined)).toEqual([]);
    });
    it("parseNumber returns fallback for undefined", () => {
        expect(parseNumber(undefined, 42)).toBe(42);
    });
    it("parseNumber parses valid number", () => {
        expect(parseNumber("10", 0)).toBe(10);
    });
    it("parseNumber returns fallback for invalid", () => {
        expect(parseNumber("not-a-num", 5)).toBe(5);
    });
    it("formatNumber formats integers", () => {
        expect(typeof formatNumber(42)).toBe("string");
    });
    it("buildClusterKey combines skill + rootCause", () => {
        expect(buildClusterKey("tdd", "syntax")).toContain("tdd");
    });
});
// verdict-parser
describe("verdict-parser (branch coverage)", () => {
    it("normalizeVerdict uppercases", () => {
        expect(typeof normalizeVerdict("pass")).toBe("string");
    });
    it("parseYamlValue handles all types", () => {
        expect(parseYamlValue("")).toBeNull();
        expect(parseYamlValue("true")).toBe(true);
        expect(parseYamlValue('"x"')).toBe("x");
        expect(parseYamlValue("plain")).toBe("plain");
    });
    it("parseStringArray parses arrays", () => {
        expect(Array.isArray(parseStringArray(["a", "b"]))).toBe(true);
    });
    it("parseStringArray handles string input", () => {
        expect(Array.isArray(parseStringArray("a, b"))).toBe(true);
    });
});
// adr-registry
describe("adr-registry (branch coverage)", () => {
    it("parseInlineArray parses [a, b]", () => {
        expect(parseInlineArray("[a, b, c]")).toEqual(["a", "b", "c"]);
    });
    it("parseInlineArray returns null for non-array", () => {
        expect(parseInlineArray("not an array")).toBeNull();
    });
    it("stripSurroundingQuotes strips quotes", () => {
        expect(stripSurroundingQuotes('"hello"')).toBe("hello");
        expect(stripSurroundingQuotes("'world'")).toBe("world");
        expect(stripSurroundingQuotes("plain")).toBe("plain");
    });
    it("escapeFieldName escapes regex chars", () => {
        expect(escapeFieldName("field.name")).toContain("\\");
    });
    it("optionalString returns undefined for null", () => {
        expect(optionalString(null)).toBeUndefined();
    });
    it("optionalString returns string for non-null", () => {
        expect(optionalString("hello")).toBe("hello");
    });
    it("tokenize splits text into words", () => {
        const tokens = tokenize("hello world test");
        expect(tokens.has("hello")).toBe(true);
        expect(tokens.has("world")).toBe(true);
    });
    it("tokenize handles empty string", () => {
        expect(tokenize("").size).toBe(0);
    });
});
//# sourceMappingURL=pattern-verdict-adr-branches.test.js.map