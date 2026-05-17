/**
 * Contract tests for the Turn Budget Discipline IRON-LAW prompt segment
 * across review subagent definitions.
 *
 * Spec: subagent-result-truncation
 * Properties validated:
 *   - P1 Bug Condition (final-report-turn requirement)
 *   - P3 Tool whitelist + Step 0 IRON-LAW preservation
 *   - P4 Read budget contract preservation
 *
 * Stage 1 (this file): assertions only target `.claude/agents/spec-check.md`.
 * Stage 2 will extend coverage to quality-check / security-check + codex toml.
 *
 * Test discipline:
 *   - Tests are intentionally RED on the unfixed tree (spec-check.md still has
 *     `maxTurns: 6`, no Turn Budget Discipline segment, no Final Report Block
 *     anchor). The first two contract checks (Step 0 forge_git IRON-LAW and
 *     Read budget) are GREEN today; they guard against future regressions.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = resolve(import.meta.dirname, "..");
function parseAgentFile(relPath) {
    const content = readFileSync(resolve(ROOT, relPath), "utf-8");
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
        throw new Error(`Agent file ${relPath} is missing YAML frontmatter`);
    }
    const [, raw, body] = match;
    const fields = {};
    for (const line of raw.split("\n")) {
        const fieldMatch = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
        if (fieldMatch) {
            fields[fieldMatch[1]] = fieldMatch[2].trim();
        }
    }
    return { raw, body, fields };
}
describe("Contract: review subagent Turn Budget Discipline (Stage 1 — spec-check)", () => {
    const SPEC_CHECK = ".claude/agents/spec-check.md";
    it("spec-check.md frontmatter has maxTurns >= 10", () => {
        const { fields } = parseAgentFile(SPEC_CHECK);
        expect(fields.maxTurns, "maxTurns frontmatter field is required").toBeDefined();
        const value = Number.parseInt(fields.maxTurns, 10);
        expect(Number.isFinite(value), `maxTurns must be numeric, got "${fields.maxTurns}"`).toBe(true);
        expect(value, "Stage 1 raises maxTurns from 6 to 10 to leave room for final-report turn").toBeGreaterThanOrEqual(10);
    });
    it("spec-check.md prompt contains Turn Budget Discipline IRON-LAW segment", () => {
        const { body } = parseAgentFile(SPEC_CHECK);
        expect(body, "## Turn Budget Discipline header is required").toContain("## Turn Budget Discipline");
        expect(body, "Turn Budget Discipline must be marked as an IRON-LAW").toContain("IRON-LAW");
    });
    it("spec-check.md prompt contains Final Report Block anchor", () => {
        const { body } = parseAgentFile(SPEC_CHECK);
        expect(body, "## Final Report Block anchor signals the final-report-turn template").toContain("## Final Report Block");
    });
    it("spec-check.md preserves Step 0 forge_git IRON-LAW (regression guard)", () => {
        const { body } = parseAgentFile(SPEC_CHECK);
        expect(body, "Step 0 forge_git IRON-LAW must remain after Turn Budget Discipline insertion").toContain('forge_git(subcommand="diff-content")');
    });
    it("spec-check.md preserves Read budget contract (regression guard)", () => {
        const { body } = parseAgentFile(SPEC_CHECK);
        expect(body, "Read 预算 ≤ 3 contract must remain after Step 0.5/0.6 merge").toContain("Read 预算");
    });
});
describe.each([
    { name: "quality-check", path: ".claude/agents/quality-check.md", layer: "Layer 2" },
    { name: "security-check", path: ".claude/agents/security-check.md", layer: "Layer 3" },
])("Contract: review subagent Turn Budget Discipline (Stage 2 — $name)", ({ path, layer }) => {
    it(`${path} frontmatter has maxTurns >= 10`, () => {
        const { fields } = parseAgentFile(path);
        expect(fields.maxTurns, "maxTurns frontmatter field is required").toBeDefined();
        const value = Number.parseInt(fields.maxTurns, 10);
        expect(Number.isFinite(value), `maxTurns must be numeric, got "${fields.maxTurns}"`).toBe(true);
        expect(value, "Stage 2 raises maxTurns from 6 to 10 to leave room for final-report turn").toBeGreaterThanOrEqual(10);
    });
    it(`${path} prompt contains Turn Budget Discipline IRON-LAW segment`, () => {
        const { body } = parseAgentFile(path);
        expect(body, "## Turn Budget Discipline header is required").toContain("## Turn Budget Discipline");
        expect(body, "Turn Budget Discipline must be marked as an IRON-LAW").toContain("IRON-LAW");
    });
    it(`${path} prompt contains Final Report Block anchor referencing ${layer}`, () => {
        const { body } = parseAgentFile(path);
        expect(body, "## Final Report Block anchor signals the final-report-turn template").toContain("## Final Report Block");
        expect(body, `Final Report Block must reference the reviewer's own layer (${layer})`).toContain(`## ${layer}`);
    });
    it(`${path} preserves Step 0 forge_git IRON-LAW (regression guard)`, () => {
        const { body } = parseAgentFile(path);
        expect(body, "Step 0 forge_git IRON-LAW must remain after Turn Budget Discipline insertion").toContain('forge_git(subcommand="diff-content")');
    });
    it(`${path} preserves Read budget contract (regression guard)`, () => {
        const { body } = parseAgentFile(path);
        expect(body, "Read 预算 ≤ 3 contract must remain after Step 0.5/0.6 merge").toContain("Read 预算");
    });
});
describe("Contract: codex toml integrity (Stage 2)", () => {
    const TOML_FILES = [
        ".codex/agents/quality-check.toml",
        ".codex/agents/security-check.toml",
    ];
    for (const tomlPath of TOML_FILES) {
        it(`${tomlPath} developer_instructions contains Turn Budget Discipline IRON-LAW segment`, () => {
            const content = readFileSync(resolve(ROOT, tomlPath), "utf-8");
            expect(content, "Codex toml must include the same Turn Budget Discipline IRON-LAW as the .claude/agents/*.md counterpart").toContain("## Turn Budget Discipline");
            expect(content, "IRON-LAW marker must be present").toContain("IRON-LAW");
        });
        it(`${tomlPath} developer_instructions contains layer-specific Final Report header`, () => {
            const content = readFileSync(resolve(ROOT, tomlPath), "utf-8");
            const expectedLayer = tomlPath.includes("quality-check") ? "## Layer 2" : "## Layer 3";
            expect(content, `Codex toml must reference ${expectedLayer} in the Final-Report Block contract`).toContain(expectedLayer);
        });
    }
    it(".codex/agents/spec-check.toml is a known Out-of-Scope absence (followup spec codex-review-parity)", () => {
        // Documented in design.md "Out of Scope" — codex spec-check parity is deferred.
        // This test pins the absence so a future fix is visible: when the file appears,
        // the test fails and reminds us to extend coverage.
        const path = resolve(ROOT, ".codex/agents/spec-check.toml");
        const exists = existsSync(path);
        expect(exists, "If .codex/agents/spec-check.toml is added, extend agent-prompt-discipline.test.ts to cover it.").toBe(false);
    });
});
//# sourceMappingURL=agent-prompt-discipline.test.js.map