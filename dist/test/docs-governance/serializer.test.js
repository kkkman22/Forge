import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../src/docs-governance/frontmatter/parser.js";
import { serialize } from "../../src/docs-governance/frontmatter/serializer.js";
// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function makeFrontmatter(overrides = {}) {
    return {
        title: "Test Doc",
        category: "getting-started",
        audience: ["new-user"],
        updated: "2026-05-01",
        owner: "Forge Team",
        ...overrides,
    };
}
// ─────────────────────────────────────────────────────────────
// Field order
// ─────────────────────────────────────────────────────────────
describe("serialize — field order", () => {
    it("outputs fields in canonical order: title → category → audience → updated → owner → mirror_of", () => {
        const fm = makeFrontmatter({ mirror_of: "foo.md" });
        const result = serialize(fm);
        const lines = result.split("\n");
        const titleIdx = lines.findIndex((l) => l.startsWith("title:"));
        const categoryIdx = lines.findIndex((l) => l.startsWith("category:"));
        const audienceIdx = lines.findIndex((l) => l.startsWith("audience:"));
        const updatedIdx = lines.findIndex((l) => l.startsWith("updated:"));
        const ownerIdx = lines.findIndex((l) => l.startsWith("owner:"));
        const mirrorIdx = lines.findIndex((l) => l.startsWith("mirror_of:"));
        expect(titleIdx).toBeLessThan(categoryIdx);
        expect(categoryIdx).toBeLessThan(audienceIdx);
        expect(audienceIdx).toBeLessThan(updatedIdx);
        expect(updatedIdx).toBeLessThan(ownerIdx);
        expect(ownerIdx).toBeLessThan(mirrorIdx);
    });
    it("omits mirror_of when not present", () => {
        const fm = makeFrontmatter();
        const result = serialize(fm);
        expect(result).not.toContain("mirror_of");
    });
});
// ─────────────────────────────────────────────────────────────
// Array style
// ─────────────────────────────────────────────────────────────
describe("serialize — array block style", () => {
    it("serializes audience array with block style (- value)", () => {
        const fm = makeFrontmatter({
            audience: ["new-user", "advanced-user"],
        });
        const result = serialize(fm);
        expect(result).toContain("- new-user");
        expect(result).toContain("- advanced-user");
    });
    it("handles single-element audience", () => {
        const fm = makeFrontmatter({ audience: ["contributor"] });
        const result = serialize(fm);
        expect(result).toContain("- contributor");
        // Should appear exactly once as a list item
        const dashLines = result.split("\n").filter((l) => l.trim().startsWith("- "));
        expect(dashLines).toHaveLength(1);
    });
});
// ─────────────────────────────────────────────────────────────
// Line endings and format
// ─────────────────────────────────────────────────────────────
describe("serialize — format constraints", () => {
    it("uses LF line endings (no CRLF)", () => {
        const fm = makeFrontmatter();
        const result = serialize(fm);
        expect(result).not.toContain("\r\n");
        expect(result).not.toContain("\r");
    });
    it("has no trailing whitespace on any line", () => {
        const fm = makeFrontmatter();
        const result = serialize(fm);
        const lines = result.split("\n");
        for (const line of lines) {
            // Allow trailing newline at very end (empty last line) but not spaces
            if (line.length > 0) {
                expect(line).toBe(line.trimEnd());
            }
        }
    });
    it("starts with --- on first line", () => {
        const fm = makeFrontmatter();
        const result = serialize(fm);
        expect(result.startsWith("---\n")).toBe(true);
    });
    it("closing --- followed by exactly one LF then one empty line then body", () => {
        const fm = makeFrontmatter();
        const body = "# Hello\n\nWorld";
        const result = serialize(fm, body);
        // Find the closing ---
        const secondDashIndex = result.indexOf("---", 3);
        expect(secondDashIndex).toBeGreaterThan(0);
        // After closing ---: LF + empty line + body
        const afterClosing = result.slice(secondDashIndex + 3);
        expect(afterClosing.startsWith("\n\n")).toBe(true);
        expect(afterClosing).toBe(`\n\n${body}`);
    });
    it("omits body section when no body provided", () => {
        const fm = makeFrontmatter();
        const result = serialize(fm);
        // Should end with closing --- + LF + empty line
        expect(result.endsWith("---\n")).toBe(true);
    });
});
// ─────────────────────────────────────────────────────────────
// Date quoting
// ─────────────────────────────────────────────────────────────
describe("serialize — date quoting", () => {
    it("quotes the updated date to prevent YAML date parsing", () => {
        const fm = makeFrontmatter({ updated: "2026-05-01" });
        const result = serialize(fm);
        // YAML parses unquoted 2026-05-01 as a Date object, so we must quote it
        expect(result).toMatch(/updated:\s*['"]2026-05-01['"]/);
    });
});
// ─────────────────────────────────────────────────────────────
// Roundtrip: object roundtrip — parse(serialize(fm)) ≡ fm
// ─────────────────────────────────────────────────────────────
describe("serialize — PBT roundtrip: parse(serialize(fm)) ≡ fm", () => {
    const testCases = [
        makeFrontmatter(),
        makeFrontmatter({ mirror_of: "guide.md" }),
        makeFrontmatter({
            audience: ["new-user", "daily-developer", "advanced-user"],
            category: "advanced",
            title: "Complex Doc Title with Spaces",
        }),
        makeFrontmatter({
            audience: ["auditor"],
            category: "audits",
            owner: "Security Team",
            updated: "2026-05-20",
        }),
        makeFrontmatter({
            title: "Owner: Has Colon",
            owner: "Team <team@example.com>",
        }),
    ];
    for (const fm of testCases) {
        it(`roundtrips: title="${fm.title}", category="${fm.category}"`, () => {
            const serialized = serialize(fm);
            const { frontmatter: parsed, diagnostics } = parseFrontmatter(serialized);
            expect(diagnostics).toHaveLength(0);
            expect(parsed).not.toBeNull();
            expect(parsed.title).toBe(fm.title);
            expect(parsed.category).toBe(fm.category);
            expect(parsed.audience).toEqual([...fm.audience]);
            expect(parsed.updated).toBe(fm.updated);
            expect(parsed.owner).toBe(fm.owner);
            expect(parsed.mirror_of).toBe(fm.mirror_of);
        });
    }
});
// ─────────────────────────────────────────────────────────────
// Roundtrip: text roundtrip — parse(serialize(parse(yaml))) ≡ parse(yaml)
// ─────────────────────────────────────────────────────────────
describe("serialize — PBT roundtrip: parse(serialize(parse(yaml))) ≡ parse(yaml)", () => {
    const originalTexts = [
        [
            "---",
            "title: Getting Started",
            "category: getting-started",
            "audience:",
            "  - new-user",
            "updated: '2026-05-01'",
            "owner: Forge Team",
            "---",
            "",
            "# Body",
            "",
            "Welcome.",
        ].join("\n"),
        [
            "---",
            "title: Advanced Guide",
            "category: advanced",
            "audience:",
            "  - advanced-user",
            "  - contributor",
            "updated: '2026-05-20'",
            "owner: Dev Team",
            "mirror_of: basics.md",
            "---",
            "",
            "# Advanced",
        ].join("\n"),
    ];
    for (const original of originalTexts) {
        it(`roundtrips text: "${original.split("\n")[1]}"`, () => {
            const firstParse = parseFrontmatter(original);
            expect(firstParse.frontmatter).not.toBeNull();
            const serialized = serialize(firstParse.frontmatter, firstParse.body);
            const secondParse = parseFrontmatter(serialized);
            expect(secondParse.diagnostics).toHaveLength(0);
            expect(secondParse.frontmatter).not.toBeNull();
            expect(secondParse.frontmatter).toEqual(firstParse.frontmatter);
        });
    }
});
//# sourceMappingURL=serializer.test.js.map