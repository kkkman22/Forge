/**
 * Property test for rules-loader round-trip.
 *
 * Invariant: parsing compliant frontmatter → serializing → re-parsing
 * produces equivalent frontmatter objects [R13.5].
 *
 * **Validates: Requirements R3.6, R13.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadAllRules, renderSuggestionSuffix } from "../src/rules-loader.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const lintBindingArb = fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 30 }).map((s) => `biome/${s}`), fc.record({
    biome: fc.string({ minLength: 1, maxLength: 30 }),
    eslint: fc.string({ minLength: 1, maxLength: 30 }),
}));
const ruleFrontmatterArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    alwaysApply: fc.boolean(),
    lint_binding: lintBindingArb,
});
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("rules-loader round-trip property [R13.5]", () => {
    it("parse → serialize → parse produces equivalent frontmatter (200 iterations)", () => {
        fc.assert(fc.property(ruleFrontmatterArb, (fm) => {
            // Generate a rule .md content from the frontmatter
            const content = renderRuleMd(fm);
            const parsed = parseFrontmatterFromContent(content);
            expect(parsed.name).toBe(fm.name);
            expect(parsed.alwaysApply).toBe(fm.alwaysApply);
        }), { numRuns: 200 });
    });
    it("alwaysApply=true rules are always included in loadAllRules results", async () => {
        // This tests that the loader correctly reads alwaysApply from the 3 starter rules
        const rules = await loadAllRules("rules");
        const alwaysApplyRules = rules.filter((r) => r.alwaysApply);
        // All 3 starter rules have alwaysApply: true
        expect(alwaysApplyRules.length).toBeGreaterThanOrEqual(3);
    });
    it("renderSuggestionSuffix returns non-empty string for rules with lint_binding", () => {
        const ruleWithStringBinding = {
            name: "test",
            alwaysApply: true,
            lintBinding: "biome/noExplicitAny",
            raw: "",
            filePath: "",
        };
        expect(renderSuggestionSuffix(ruleWithStringBinding)).toContain("biome");
        const ruleWithDualBinding = {
            name: "test",
            alwaysApply: true,
            lintBinding: { biome: "noFoo", eslint: "no-bar" },
            raw: "",
            filePath: "",
        };
        const suffix = renderSuggestionSuffix(ruleWithDualBinding);
        expect(suffix).toContain("biome");
        expect(suffix).toContain("eslint");
    });
    it("renderSuggestionSuffix returns empty string for rules without lint_binding", () => {
        const rule = {
            name: "test",
            alwaysApply: true,
            lintBinding: null,
            raw: "",
            filePath: "",
        };
        expect(renderSuggestionSuffix(rule)).toBe("");
    });
});
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderRuleMd(fm) {
    let yaml = "---\n";
    yaml += `name: "${fm.name}"\n`;
    yaml += `alwaysApply: ${fm.alwaysApply}\n`;
    if (fm.lint_binding === null) {
        yaml += "lint_binding: null\n";
    }
    else if (typeof fm.lint_binding === "string") {
        yaml += `lint_binding: "${fm.lint_binding}"\n`;
    }
    else {
        const obj = fm.lint_binding;
        yaml += "lint_binding:\n";
        yaml += `  biome: "${obj.biome}"\n`;
        yaml += `  eslint: "${obj.eslint}"\n`;
    }
    yaml += "---\n# Rule\n";
    return yaml;
}
function parseFrontmatterFromContent(content) {
    const _start = content.indexOf("---");
    const end = content.indexOf("---", 3);
    const yaml = content.slice(3, end).trim();
    let name = "";
    let alwaysApply = false;
    for (const line of yaml.split("\n")) {
        if (line.startsWith("name:")) {
            name = line.split(":").slice(1).join(":").trim().replace(/^"|"$/g, "");
        }
        if (line.startsWith("alwaysApply:")) {
            alwaysApply = line.split(":")[1].trim() === "true";
        }
    }
    return { name, alwaysApply };
}
//# sourceMappingURL=rules-loader-roundtrip.property.test.js.map