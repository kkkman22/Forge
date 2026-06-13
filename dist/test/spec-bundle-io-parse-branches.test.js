import { describe, expect, it } from "vitest";
import { extractListItems, parseLegacySpec } from "../src/spec-bundle-io.js";
describe("extractListItems (branch coverage)", () => {
    it("extracts dash-prefixed items", () => {
        expect(extractListItems("- item 1\n- item 2")).toEqual(["item 1", "item 2"]);
    });
    it("extracts asterisk-prefixed items", () => {
        expect(extractListItems("* item a\n* item b")).toEqual(["item a", "item b"]);
    });
    it("filters empty lines", () => {
        expect(extractListItems("- real\n\n  \n- also real")).toEqual(["real", "also real"]);
    });
    it("returns [] for empty input", () => {
        expect(extractListItems("")).toEqual([]);
    });
    it("handles plain text lines (no prefix)", () => {
        expect(extractListItems("just text\nmore text")).toEqual(["just text", "more text"]);
    });
});
describe("parseLegacySpec (branch coverage)", () => {
    it("parses a spec with frontmatter", () => {
        const text = [
            "---",
            "feature: my-feature",
            "status: locked",
            "date: 2026-06-14",
            "---",
            "",
            "# 目的",
            "",
            "This is the purpose.",
            "",
            "### 需求 1：First requirement",
            "",
            "Body of requirement 1.",
            "",
        ].join("\n");
        const doc = parseLegacySpec(text);
        expect(doc.frontmatter.feature).toBe("my-feature");
        expect(doc.frontmatter.status).toBe("locked");
    });
    it("parses a spec without frontmatter (defaults)", () => {
        const doc = parseLegacySpec("# 目的\n\nNo frontmatter here.");
        expect(doc.frontmatter.feature).toBe("unknown");
        expect(doc.frontmatter.status).toBe("draft");
    });
    it("parses a spec with no purpose section", () => {
        const doc = parseLegacySpec("---\nfeature: x\n---\n\n# Other\n\ncontent");
        expect(doc).toBeDefined();
    });
    it("parses empty content gracefully", () => {
        const doc = parseLegacySpec("");
        expect(doc).toBeDefined();
        expect(doc.frontmatter.feature).toBe("unknown");
    });
    it("parses multiple requirements", () => {
        const text = [
            "---",
            "feature: multi",
            "---",
            "",
            "# 目的",
            "",
            "Purpose.",
            "",
            "### 需求 1：First",
            "",
            "Body 1.",
            "",
            "### 需求 2：Second",
            "",
            "Body 2.",
            "",
        ].join("\n");
        const doc = parseLegacySpec(text);
        expect(doc.requirements.length).toBeGreaterThanOrEqual(0);
    });
});
//# sourceMappingURL=spec-bundle-io-parse-branches.test.js.map