/**
 * Property-based tests for the Turn Budget Discipline IRON-LAW contract.
 *
 * Spec: subagent-result-truncation
 * Properties validated:
 *   - P1 Bug Condition (Turn Budget Discipline + Final Report Block must coexist)
 *   - P3 Tool whitelist + Step 0 IRON-LAW preservation
 *   - P4 maxTurns >= 10 invariant
 *
 * The PBT generates arbitrary mutations of the contract scanner inputs and
 * asserts that:
 *   - Removing the "## Turn Budget Discipline" segment causes the scanner to fail.
 *   - maxTurns < 10 always fails the scanner.
 *   - maxTurns in [10, 30] always passes the scanner (when other contract
 *     fields are present).
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
/**
 * Pure contract scanner: given a (frontmatter fields, body) pair, decide if
 * the agent file satisfies the Turn Budget Discipline contract.
 */
function checkAgentContract(fields, body) {
    const reasons = [];
    const maxTurns = fields.maxTurns ? Number.parseInt(fields.maxTurns, 10) : NaN;
    if (!Number.isFinite(maxTurns) || maxTurns < 10) {
        reasons.push(`maxTurns must be >= 10, got "${fields.maxTurns}"`);
    }
    if (!body.includes("## Turn Budget Discipline")) {
        reasons.push("missing ## Turn Budget Discipline segment");
    }
    if (!body.includes("IRON-LAW")) {
        reasons.push("Turn Budget Discipline must be marked as IRON-LAW");
    }
    if (!body.includes("## Final Report Block")) {
        reasons.push("missing ## Final Report Block anchor");
    }
    if (!body.includes('forge_git(subcommand="diff-content")')) {
        reasons.push("Step 0 forge_git IRON-LAW must remain");
    }
    if (!body.includes("Read 预算")) {
        reasons.push("Read budget contract must remain");
    }
    return { passes: reasons.length === 0, reasons };
}
const VALID_BODY = [
    "## Identity",
    "## Turn Budget Discipline (IRON-LAW)",
    "Use forge_git(subcommand=\"diff-content\") first.",
    "Read 预算 ≤ 3.",
    "## Final Report Block",
    "Final report must start with ## Layer N.",
].join("\n\n");
describe("PBT: agent-prompt-discipline contract scanner", () => {
    it("any maxTurns < 10 always fails the scanner (P4)", () => {
        fc.assert(fc.property(fc.integer({ min: 0, max: 9 }), (mt) => {
            const result = checkAgentContract({ maxTurns: String(mt) }, VALID_BODY);
            expect(result.passes).toBe(false);
            expect(result.reasons.some((r) => r.includes("maxTurns must be >= 10"))).toBe(true);
        }), { numRuns: 50 });
    });
    it("any maxTurns in [10, 30] passes (when other contract fields are present)", () => {
        fc.assert(fc.property(fc.integer({ min: 10, max: 30 }), (mt) => {
            const result = checkAgentContract({ maxTurns: String(mt) }, VALID_BODY);
            expect(result.passes).toBe(true);
        }), { numRuns: 50 });
    });
    it("removing the Turn Budget Discipline segment always fails (P1)", () => {
        fc.assert(fc.property(fc.integer({ min: 10, max: 30 }), (mt) => {
            const mutated = VALID_BODY.replace("## Turn Budget Discipline (IRON-LAW)", "## Removed Discipline");
            const result = checkAgentContract({ maxTurns: String(mt) }, mutated);
            expect(result.passes).toBe(false);
            expect(result.reasons.some((r) => r.includes("Turn Budget Discipline"))).toBe(true);
        }), { numRuns: 30 });
    });
    it("removing the Final Report Block anchor always fails (P1)", () => {
        fc.assert(fc.property(fc.integer({ min: 10, max: 30 }), (mt) => {
            const mutated = VALID_BODY.replace("## Final Report Block", "");
            const result = checkAgentContract({ maxTurns: String(mt) }, mutated);
            expect(result.passes).toBe(false);
            expect(result.reasons.some((r) => r.includes("Final Report Block"))).toBe(true);
        }), { numRuns: 30 });
    });
    it("removing forge_git IRON-LAW always fails (P3 regression guard)", () => {
        const mutated = VALID_BODY.replace('forge_git(subcommand="diff-content")', "git diff");
        const result = checkAgentContract({ maxTurns: "10" }, mutated);
        expect(result.passes).toBe(false);
        expect(result.reasons.some((r) => r.includes("Step 0 forge_git"))).toBe(true);
    });
    it("removing Read 预算 contract always fails (P4 regression guard)", () => {
        const mutated = VALID_BODY.replace("Read 预算 ≤ 3.", "");
        const result = checkAgentContract({ maxTurns: "10" }, mutated);
        expect(result.passes).toBe(false);
        expect(result.reasons.some((r) => r.includes("Read budget"))).toBe(true);
    });
});
//# sourceMappingURL=agent-prompt-discipline.property.test.js.map