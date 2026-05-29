import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const HOOK_PATH = resolve(__dirname, "../../../.githooks/pre-commit");
describe("pre-commit hook", () => {
    const hookContent = readFileSync(HOOK_PATH, "utf-8");
    it("has valid shebang line", () => {
        expect(hookContent.startsWith("#!/bin/sh")).toBe(true);
    });
    it("uses set -e for error propagation", () => {
        expect(hookContent).toContain("set -e");
    });
    it("has grace period support", () => {
        expect(hookContent).toContain("GRACE_UNTIL");
        expect(hookContent).toContain("IN_GRACE");
    });
    it("runs root-whitelist check when ROOT_MD_CHANGED", () => {
        expect(hookContent).toContain("ROOT_MD_CHANGED");
        expect(hookContent).toContain("check-docs-root-whitelist");
    });
    it("runs frontmatter, bilingual, index, updated when DOCS_CHANGED", () => {
        expect(hookContent).toContain("check-docs-frontmatter");
        expect(hookContent).toContain("check-docs-bilingual");
        expect(hookContent).toContain("check-docs-index");
        expect(hookContent).toContain("check-docs-updated");
    });
    it("runs embed sync check when DOCS_CHANGED or SSOT_CHANGED", () => {
        expect(hookContent).toContain("SSOT_CHANGED");
        expect(hookContent).toContain("check-docs-embeds");
    });
    it("runs staleness, links, quota when CONFIG_CHANGED", () => {
        expect(hookContent).toContain("CONFIG_CHANGED");
        expect(hookContent).toContain("check-docs-staleness");
        expect(hookContent).toContain("check-docs-links");
        expect(hookContent).toContain("check-docs-quota");
    });
    it("has lightweight path exit when no docs changes", () => {
        expect(hookContent).toContain("DOCS_CHANGED");
        expect(hookContent).toContain("CONFIG_CHANGED");
        // The lightweight path exits early
        const lightweightPattern = /DOCS_CHANGED.*eq 0/;
        expect(lightweightPattern.test(hookContent)).toBe(true);
    });
    it("uses timeout for per-checker execution", () => {
        expect(hookContent).toContain("timeout");
        expect(hookContent).toContain("CHECKER_TIMEOUT");
    });
    it("exits with code 1 on failure outside grace period", () => {
        expect(hookContent).toContain("FAILED=1");
        expect(hookContent).toContain("exit 1");
    });
    it("handles timeout (rc=124) as failure", () => {
        expect(hookContent).toContain("124");
        expect(hookContent).toContain("timed out");
    });
    it("downgrades errors to warnings during grace period", () => {
        expect(hookContent).toContain("grace period");
    });
});
//# sourceMappingURL=pre-commit-hook.test.js.map