/**
 * Unit tests for {@link validateAllSkills} batch entry point.
 *
 * Uses an in-memory `SkillDescriptionFs` adapter so the test never
 * touches the real filesystem. The fixture registers three SKILL.md
 * documents that together cover the three possible outcomes:
 *
 *   1. A valid description (frontmatter present, "Use when" trigger,
 *      within length, no forbidden patterns).
 *   2. A description missing the "Use when" trigger.
 *   3. A description hitting the version-number forbidden pattern.
 *
 * The test asserts both the result array length and per-file
 * valid/errors so regressions in either the dispatch logic or the
 * delegated rule evaluation surface clearly.
 *
 * **Validates: Requirement 3.6**
 */
import { describe, expect, it } from "vitest";
import { validateAllSkills } from "../src/skill-description.js";
function createFakeFs(files) {
    const store = new Map(Object.entries(files));
    const reads = [];
    return {
        store,
        reads,
        listSkillFiles: (skillsDir) => {
            // Match paths shaped like `<skillsDir>/forge-*/SKILL.md`. The real
            // node:fs adapter will use readdirSync; here we filter the store
            // by prefix and suffix so the behaviour matches the contract.
            const prefix = `${skillsDir}/forge-`;
            return [...store.keys()]
                .filter((p) => p.startsWith(prefix) && p.endsWith("/SKILL.md"))
                .sort();
        },
        readFile: (p) => {
            reads.push(p);
            const content = store.get(p);
            if (content === undefined) {
                throw new Error(`readFile: ${p} does not exist`);
            }
            return content;
        },
    };
}
// ---------------------------------------------------------------------------
// SKILL.md fixture builder
// ---------------------------------------------------------------------------
function buildSkillDoc(name, description) {
    return [
        "---",
        `name: ${name}`,
        `description: "${description.replace(/"/g, "")}"`,
        "---",
        "",
        "# Body",
        "",
    ].join("\n");
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("validateAllSkills", () => {
    it("returns one result per forge-*/SKILL.md and reports valid/errors correctly", () => {
        const skillsDir = "skills";
        const fs = createFakeFs({
            // 1. Valid description
            "skills/forge-alpha/SKILL.md": buildSkillDoc("forge-alpha", "Runs alpha workflow. Use when user invokes /forge alpha."),
            // 2. Missing "Use when" trigger
            "skills/forge-beta/SKILL.md": buildSkillDoc("forge-beta", "Handles beta tasks whenever the agent is idle."),
            // 3. Contains forbidden version-number pattern
            "skills/forge-gamma/SKILL.md": buildSkillDoc("forge-gamma", "Supports v1.2 deployments. Use when rolling out to staging."),
            // Non-forge directory must be ignored by the adapter contract
            "skills/shared/helper.md": "# shared helper, should not be scanned",
        });
        const results = validateAllSkills(fs, skillsDir);
        // Exactly three forge-*/SKILL.md files were scanned
        expect(results).toHaveLength(3);
        expect(results.map((r) => r.filePath)).toEqual([
            "skills/forge-alpha/SKILL.md",
            "skills/forge-beta/SKILL.md",
            "skills/forge-gamma/SKILL.md",
        ]);
        // Per-file outcomes
        const alpha = results[0];
        expect(alpha?.valid).toBe(true);
        expect(alpha?.errors).toEqual([]);
        expect(alpha?.hasUseWhen).toBe(true);
        const beta = results[1];
        expect(beta?.valid).toBe(false);
        expect(beta?.hasUseWhen).toBe(false);
        expect(beta?.errors).toContain('description 缺少 "Use when" 触发语');
        const gamma = results[2];
        expect(gamma?.valid).toBe(false);
        expect(gamma?.hasUseWhen).toBe(true);
        expect(gamma?.hasForbiddenPatterns).toContain("版本号");
        expect(gamma?.errors.some((e) => e.includes("版本号"))).toBe(true);
        // Each file was read exactly once via the adapter
        expect(fs.reads).toEqual([
            "skills/forge-alpha/SKILL.md",
            "skills/forge-beta/SKILL.md",
            "skills/forge-gamma/SKILL.md",
        ]);
    });
    it("returns an empty array when no forge-*/SKILL.md files exist", () => {
        const fs = createFakeFs({
            "skills/shared/helper.md": "# shared",
        });
        const results = validateAllSkills(fs, "skills");
        expect(results).toEqual([]);
        expect(fs.reads).toEqual([]);
    });
});
//# sourceMappingURL=skill-description-validate-all.test.js.map