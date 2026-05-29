import { describe, expect, it } from "vitest";
import { parseEmbeds } from "../../../src/docs-governance/ssot/embed-parser.js";
import { syncEmbeds } from "../../../src/docs-governance/ssot/embed-sync.js";
import { createRendererRegistry } from "../../../src/docs-governance/ssot/renderer-registry.js";
const P = (s) => s;
// Helper: check if content has embed directives (mirrors the logic in build-docs-embeds)
function hasEmbedDirectives(content, filePath) {
    const { directives, diagnostics } = parseEmbeds(content, filePath);
    // Only count valid directives (ignore ones with structural errors)
    const structuralErrors = diagnostics.filter((d) => d.severity === "error" &&
        (d.code === "EMBED_UNCLOSED" ||
            d.code === "EMBED_TOPIC_MISMATCH" ||
            d.code === "EMBED_NESTING" ||
            d.code === "EMBED_ORPHAN_END"));
    // Has directives AND no structural errors
    return directives.length > 0 && structuralErrors.length === 0;
}
describe("build-docs-embeds logic", () => {
    it("detects files with ssot-block directives", () => {
        const content = [
            "<!-- ssot:begin topic=commands render=commands-table -->",
            "old",
            "<!-- ssot:end topic=commands -->",
        ].join("\n");
        expect(hasEmbedDirectives(content, P("docs/test.md"))).toBe(true);
    });
    it("detects files with file-embed directives", () => {
        const content = "#[[file:snippet.md]]\n";
        expect(hasEmbedDirectives(content, P("docs/test.md"))).toBe(true);
    });
    it("does not flag files with no directives", () => {
        const content = "# Plain doc\n\nNo embeds.\n";
        expect(hasEmbedDirectives(content, P("docs/plain.md"))).toBe(false);
    });
    it("does not flag files with only structural errors", () => {
        // Unclosed begin — not a valid directive to process
        const content = "<!-- ssot:begin topic=commands render=commands-table -->\nold data\n";
        expect(hasEmbedDirectives(content, P("docs/broken.md"))).toBe(false);
    });
    it("dry-run produces correct output without modifying files", () => {
        const reg = createRendererRegistry();
        const echoRenderer = (input) => ({
            markdown: `rendered:${input.topic}`,
            diagnostics: [],
        });
        reg.register("echo", echoRenderer);
        const content = [
            "# Title",
            "<!-- ssot:begin topic=test render=echo -->",
            "old",
            "<!-- ssot:end topic=test -->",
        ].join("\n");
        // Simulate dry-run: compute result but don't write
        const { content: result, diagnostics } = syncEmbeds(content, P("docs/dry.md"), reg, new Map());
        expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
        expect(result).toContain("rendered:test");
        // Original content is unchanged (we never wrote it)
        expect(content).toContain("old");
    });
});
describe("check-docs-embeds logic", () => {
    it("detects mismatch between rendered and file content", () => {
        const reg = createRendererRegistry();
        const echoRenderer = (input) => ({
            markdown: `rendered:${input.topic}`,
            diagnostics: [],
        });
        reg.register("echo", echoRenderer);
        const fileContent = [
            "<!-- ssot:begin topic=test render=echo -->",
            "stale data",
            "<!-- ssot:end topic=test -->",
        ].join("\n");
        const { content: rendered } = syncEmbeds(fileContent, P("docs/check.md"), reg, new Map());
        // They should differ
        expect(rendered).not.toBe(fileContent);
        expect(rendered).toContain("rendered:test");
        expect(fileContent).toContain("stale data");
    });
    it("reports clean when content matches", () => {
        const reg = createRendererRegistry();
        const echoRenderer = (_input) => ({
            markdown: "current",
            diagnostics: [],
        });
        reg.register("echo", echoRenderer);
        // Sync once to get the canonical form
        const original = [
            "<!-- ssot:begin topic=test render=echo -->",
            "old",
            "<!-- ssot:end topic=test -->",
        ].join("\n");
        const { content: synced } = syncEmbeds(original, P("docs/clean.md"), reg, new Map());
        // Sync again (simulating check against already-synced file)
        const { content: reSynced } = syncEmbeds(synced, P("docs/clean.md"), reg, new Map());
        expect(reSynced).toBe(synced);
    });
    it("produces diff-friendly output for mismatches", () => {
        const original = ["line1", "line2-old", "line3"].join("\n");
        const rendered = ["line1", "line2-new", "line3"].join("\n");
        // Simulate unified diff generation
        const origLines = original.split("\n");
        const newLines = rendered.split("\n");
        let diffs = 0;
        for (let i = 0; i < Math.max(origLines.length, newLines.length); i++) {
            if (origLines[i] !== newLines[i])
                diffs++;
        }
        expect(diffs).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=build-docs-embeds.test.js.map