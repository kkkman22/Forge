import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDocsGovernanceSection, runDocsGovernanceCheck, } from "../../../src/docs-governance/reporter/learn-docs-check.js";
const ROOT = resolve(__dirname, "../../../");
describe("runDocsGovernanceCheck", () => {
    it("executes all three checkers and returns valid result", { timeout: 15_000 }, () => {
        const result = runDocsGovernanceCheck(ROOT);
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(["clean", "needs_attention"]).toContain(result.status);
        // Should have diagnostics (may be empty if all pass)
        expect(Array.isArray(result.diagnostics)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
    });
    it("handles missing script gracefully", () => {
        const result = runDocsGovernanceCheck("/nonexistent/path");
        expect(result.status).toBe("needs_attention");
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
describe("formatDocsGovernanceSection", () => {
    it("formats clean result", () => {
        const result = {
            status: "clean",
            timestamp: "2026-05-25T00:00:00.000Z",
            diagnostics: [],
            errors: [],
        };
        const output = formatDocsGovernanceSection(result);
        expect(output).toContain("## 文档治理诊断");
        expect(output).toContain("clean");
        expect(output).toContain("2026-05-25");
        expect(output).not.toContain("needs_attention");
    });
    it("formats needs_attention result with criticals", () => {
        const result = {
            status: "needs_attention",
            timestamp: "2026-05-25T00:00:00.000Z",
            diagnostics: [
                {
                    script: "check-docs-staleness",
                    severity: "error",
                    file: "docs/guide.md",
                    message: "Document is 120 days old",
                    code: "STALE_DOC",
                },
            ],
            errors: [],
        };
        const output = formatDocsGovernanceSection(result);
        expect(output).toContain("needs_attention");
        expect(output).toContain("check-docs-staleness");
        expect(output).toContain("docs/guide.md");
        expect(output).toContain("120 days old");
    });
    it("formats needs_attention result with execution errors", () => {
        const result = {
            status: "needs_attention",
            timestamp: "2026-05-25T00:00:00.000Z",
            diagnostics: [],
            errors: ["scripts/check-docs-quota.ts: timed out after 10000ms"],
        };
        const output = formatDocsGovernanceSection(result);
        expect(output).toContain("timed out");
        expect(output).toContain("check-docs-quota");
    });
});
//# sourceMappingURL=learn-docs-check.test.js.map