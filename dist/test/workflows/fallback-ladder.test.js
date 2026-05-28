import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = join(import.meta.dirname, "../..");
describe("Workflow Fallback Ladder Rule", () => {
    const rulePath = join(ROOT, ".claude", "rules", "workflow-fallback-ladder.md");
    it("rule file exists and is non-empty", () => {
        expect(existsSync(rulePath)).toBe(true);
        const content = readFileSync(rulePath, "utf-8");
        expect(content.length).toBeGreaterThan(0);
    });
    it("contains all four levels (L0-L3)", () => {
        const content = readFileSync(rulePath, "utf-8");
        expect(content).toContain("L0");
        expect(content).toContain("L1");
        expect(content).toContain("L2");
        expect(content).toContain("L3");
    });
    it("cross-references the ADR", () => {
        const content = readFileSync(rulePath, "utf-8");
        expect(content).toContain("2026-05-18-review-fallback-ladder");
        expect(content).toMatch(/hard.?gate/i);
    });
    it("has frontmatter inclusion: always", () => {
        const content = readFileSync(rulePath, "utf-8");
        expect(content).toMatch(/^---\n[\s\S]*?inclusion:\s*always/);
    });
    it("lists trigger conditions and methodology values per level", () => {
        const content = readFileSync(rulePath, "utf-8");
        expect(content).toContain("workflow");
        expect(content).toContain("subagent-parallel");
        expect(content).toContain("subagent-serial");
        expect(content).toContain("unavailable");
    });
    it("declares L3 blocks ship", () => {
        const content = readFileSync(rulePath, "utf-8");
        const l3Section = content.substring(content.lastIndexOf("L3"));
        expect(l3Section).toMatch(/block|阻断/i);
    });
});
//# sourceMappingURL=fallback-ladder.test.js.map